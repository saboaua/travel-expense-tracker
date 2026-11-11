import type { SupabaseClient } from "@supabase/supabase-js";
import { GROCERY_ITEM_COLS, GROCERY_RECEIPT_COLS } from "@/lib/columns";
import { fetchAll } from "@/lib/personal/fetch-all";
import type { ItemLite, ReceiptLite } from "@/lib/personal/grocery";
import type { TrackerRow } from "@/lib/personal/grocery";
import type { MatchDecision } from "@/lib/personal/price-compare";
import { isRowDelete, isRowSave } from "@/lib/row-outbox";
import type { OutboxItem } from "@/lib/outbox";

/** What the grocery screens load, and the key each is kept under on the phone. Shared with the background warm-up. */

type Result<T> = Promise<{ data: T | null; error: unknown }>;

export type GroceryReceipt = { id: string; store: string; purchase_date: string; total: number; currency: string; receipt_path: string | null; notes: string | null };
export type GroceryItem = { id: string; name: string; category: string; quantity: number; unit_price: number; line_total: number; unit: string | null; normalized_name?: string };
export type ReceiptBundle = { receipt: GroceryReceipt; items: GroceryItem[] };
export type OverviewReceipt = ReceiptLite & { store: string };
export type Overview = { receipts: OverviewReceipt[]; items: ItemLite[] };

export const overviewKey = (userId: string) => `${userId}:groceries:overview`;
export const pricesKey = (userId: string) => `${userId}:groceries:prices`;
export const priceMatchesKey = (userId: string) => `${userId}:groceries:price-matches`;
export const receiptKey = (userId: string, id: string) => `${userId}:groceries:receipt:${id}`;

const shift = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function fetchOverview(supabase: SupabaseClient, today: string): Result<Overview> {
  // Last 14 months are plenty for monthly comparison and keep the page quick
  const from = `${shift(today.slice(0, 7), -13)}-01`;
  try {
    const [r, i] = await Promise.all([
      fetchAll<OverviewReceipt>((a, b) => supabase.from("grocery_receipts").select("id, store, purchase_date, total, currency").gte("purchase_date", from).order("purchase_date", { ascending: false }).range(a, b)),
      fetchAll<ItemLite & { grocery_receipts: unknown }>((a, b) =>
        supabase.from("grocery_items").select("receipt_id, category, name, normalized_name, line_total, grocery_receipts!inner(purchase_date)").gte("grocery_receipts.purchase_date", from).range(a, b)
      ),
    ]);
    return {
      data: {
        receipts: r.map((x) => ({ ...x, total: Number(x.total) })),
        items: i.map((x) => ({ receipt_id: x.receipt_id, category: x.category, name: x.name, normalized_name: x.normalized_name, line_total: Number(x.line_total) })),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchPrices(supabase: SupabaseClient): Result<TrackerRow[]> {
  try {
    const data = await fetchAll<Omit<TrackerRow, "receipt"> & { grocery_receipts: TrackerRow["receipt"] | TrackerRow["receipt"][] }>((a, b) =>
      supabase.from("grocery_items").select("name, normalized_name, category, unit_price, quantity, unit, line_total, grocery_receipts!inner(store, purchase_date, currency)").order("created_at", { ascending: false }).range(a, b)
    );
    return {
      data: data.map((d) => ({
        name: d.name, normalized_name: d.normalized_name, category: d.category, unit_price: Number(d.unit_price), quantity: Number(d.quantity),
        unit: d.unit ?? null, line_total: Number(d.line_total),
        receipt: Array.isArray(d.grocery_receipts) ? d.grocery_receipts[0] : d.grocery_receipts,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/** Your Yes / No answers on "same product?". Before the migration is run there is no table: that simply means no answers yet. */
export async function fetchPriceMatches(supabase: SupabaseClient): Result<MatchDecision[]> {
  try {
    const { data, error } = await supabase.from("grocery_price_matches").select("key_a, key_b, same").limit(2000);
    if (error) return { data: [], error: null };
    return { data: (data ?? []).map((d) => ({ key_a: String(d.key_a), key_b: String(d.key_b), same: d.same === true })), error: null };
  } catch {
    return { data: [], error: null };
  }
}

export async function fetchReceiptBundle(supabase: SupabaseClient, id: string): Result<ReceiptBundle> {
  const [r, i] = await Promise.all([
    supabase.from("grocery_receipts").select(GROCERY_RECEIPT_COLS).eq("id", id).single(),
    supabase.from("grocery_items").select(GROCERY_ITEM_COLS).eq("receipt_id", id).order("created_at"),
  ]);
  if (r.error || !r.data) return { data: null, error: r.error ?? new Error("Receipt not found") };
  if (i.error) return { data: null, error: i.error };
  const receipt = { ...(r.data as unknown as GroceryReceipt), total: Number((r.data as { total: number }).total) };
  const items = ((i.data as unknown as GroceryItem[]) ?? []).map((x) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price), line_total: Number(x.line_total) }));
  return { data: { receipt, items }, error: null };
}

/** The items of a receipt once a waiting change is applied (the waiting change carries the receipt's whole item list). */
export function itemsWithWaiting(receiptId: string, saved: GroceryItem[], pending: OutboxItem[]): GroceryItem[] {
  const w = pending.find((i) => i.id === receiptId && isRowSave(i) && i.table === "grocery_receipts");
  if (!w || !isRowSave(w) || !w.children) return saved;
  return w.children.rows.map((r) => r as unknown as GroceryItem);
}

/** Overview items with waiting changes applied: items of receipts being replaced or deleted go, items of waiting receipts come. */
export function overviewItemsWithWaiting(items: ItemLite[], pending: OutboxItem[]): ItemLite[] {
  let out = items;
  for (const i of pending) {
    if (isRowDelete(i) && i.table === "grocery_receipts") out = out.filter((x) => x.receipt_id !== i.id);
    else if (isRowSave(i) && i.table === "grocery_receipts" && i.children) {
      out = out.filter((x) => x.receipt_id !== i.id);
      out = [...out, ...i.children.rows.map((r) => ({ receipt_id: i.id, category: String(r.category), name: String(r.name), normalized_name: String(r.normalized_name ?? ""), line_total: Number(r.line_total) }))];
    }
  }
  return out;
}
