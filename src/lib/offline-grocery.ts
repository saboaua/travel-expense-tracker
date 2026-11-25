import { normPaid, normTripRef, type PaidWith } from "@/lib/paid-with";
import { fetchShoppingNames } from "@/lib/personal/item-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GROCERY_ITEM_COLS, GROCERY_RECEIPT_COLS, GROCERY_RECEIPT_COLS_BASE, GROCERY_RECEIPT_COLS_PAY, PRICE_CHECK_COLS, isMissingColumn } from "@/lib/columns";
import { checkToTracker, type PriceCheck } from "@/lib/personal/price-notes";
import { fetchAll } from "@/lib/personal/fetch-all";
import type { ItemLite, ReceiptLite } from "@/lib/personal/grocery";
import type { TrackerRow } from "@/lib/personal/grocery";
import type { MatchDecision } from "@/lib/personal/price-compare";
import { isRowDelete, isRowSave } from "@/lib/row-outbox";
import type { OutboxItem } from "@/lib/outbox";

/** What the grocery screens load, and the key each is kept under on the phone. Shared with the background warm-up. */

type Result<T> = Promise<{ data: T | null; error: unknown }>;

export type GroceryReceipt = { id: string; store: string; purchase_date: string; total: number; currency: string; receipt_path: string | null; notes: string | null; prices_only?: boolean | null; paid_with?: string | null; trip_ref?: string | null; area?: string | null; type_id?: string | null; country?: string | null };
export type GroceryItem = { id: string; name: string; category: string; quantity: number; unit_price: number; line_total: number; unit: string | null; normalized_name?: string };
export type ReceiptBundle = { receipt: GroceryReceipt; items: GroceryItem[] };
export type OverviewReceipt = ReceiptLite & { store: string; prices_only?: boolean | null; paid_with?: PaidWith | null; trip_ref?: string | null; area?: string | null; type_id?: string | null };
/** itemsFrom: the first month (YYYY-MM) whose receipt lines are in `items`; older months are fetched when opened. Missing: all of them are there. */
export type Overview = { receipts: OverviewReceipt[]; items: ItemLite[]; itemsFrom?: string };

/** Are the receipt lines of this month (YYYY-MM) on hand? The overview brings its first months; older ones are fetched when opened. */
export const monthItemsLoaded = (itemsFrom: string | undefined, month: string, fetched: string[]): boolean => !itemsFrom || month >= itemsFrom || fetched.includes(month);

export const overviewKey = (userId: string) => `${userId}:groceries:overview`;
export const monthItemsKey = (userId: string, month: string) => `${userId}:groceries:items:${month}`;
export const pricesKey = (userId: string) => `${userId}:groceries:prices`;
export const priceMatchesKey = (userId: string) => `${userId}:groceries:price-matches`;
export const receiptKey = (userId: string, id: string) => `${userId}:groceries:receipt:${id}`;

const shift = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const liteItem = (x: ItemLite): ItemLite => ({ receipt_id: x.receipt_id, category: x.category, name: x.name, normalized_name: x.normalized_name, line_total: Number(x.line_total) });

/** The lines of the receipts bought on or after `from` (YYYY-MM-DD) and before `before` when given. */
async function fetchItems(supabase: SupabaseClient, from: string, before?: string): Promise<ItemLite[]> {
  const rows = await fetchAll<ItemLite & { grocery_receipts: unknown }>((a, b) => {
    let q = supabase.from("grocery_items").select("receipt_id, category, name, normalized_name, line_total, grocery_receipts!inner(purchase_date)").gte("grocery_receipts.purchase_date", from);
    if (before) q = q.lt("grocery_receipts.purchase_date", before);
    return q.range(a, b);
  });
  return rows.map(liteItem);
}

/** The lines of one month (YYYY-MM), for a month older than the ones the overview loads at first. */
export async function fetchMonthItems(supabase: SupabaseClient, month: string): Result<ItemLite[]> {
  try {
    return { data: await fetchItems(supabase, `${month}-01`, `${shift(month, 1)}-01`), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchOverview(supabase: SupabaseClient, today: string): Result<Overview> {
  // Last 14 months are plenty for monthly comparison and keep the page quick
  const from = `${shift(today.slice(0, 7), -13)}-01`;
  const itemsFrom = shift(today.slice(0, 7), -1);
  try {
    const receipts = (cols: string) => fetchAll<OverviewReceipt>((a, b) => supabase.from("grocery_receipts").select(cols).gte("purchase_date", from).order("purchase_date", { ascending: false }).range(a, b) as never);
    const [r, i] = await Promise.all([
      // Before the price-notes migration there is no prices_only column: everything is spending
      receipts("id, store, purchase_date, total, currency, prices_only, paid_with, trip_ref, area, type_id").catch((e) => {
        if (!isMissingColumn({ message: e instanceof Error ? e.message : "" })) throw e;
        return receipts("id, store, purchase_date, total, currency, prices_only, paid_with, trip_ref, area");
      }).catch((e) => {
        if (!isMissingColumn({ message: e instanceof Error ? e.message : "" })) throw e;
        return receipts("id, store, purchase_date, total, currency, prices_only, paid_with, trip_ref");
      }).catch((e) => {
        if (!isMissingColumn({ message: e instanceof Error ? e.message : "" })) throw e;
        return receipts("id, store, purchase_date, total, currency, prices_only").catch((e2) => { if (isMissingColumn({ message: e2 instanceof Error ? e2.message : "" })) return receipts("id, store, purchase_date, total, currency"); throw e2; });
      }),
      // Receipt lines are only needed for the month on screen: this month and the one before. Older months load when opened.
      fetchItems(supabase, `${itemsFrom}-01`),
    ]);
    return {
      data: {
        receipts: r.map((x) => ({ ...x, total: Number(x.total), prices_only: x.prices_only === true, paid_with: normPaid(x.paid_with), trip_ref: normTripRef(x.trip_ref), area: x.area === "shopping" ? "shopping" : x.area === "other" && x.type_id ? "other" : "groceries", type_id: x.area === "other" ? x.type_id ?? null : null })),
        items: i,
        itemsFrom,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/** Your prices. The nightly community share passes `forUser` (it reads with the service key, which has no row security of its own). */
export async function fetchPrices(supabase: SupabaseClient, forUser?: string): Result<TrackerRow[]> {
  try {
    type Raw = Omit<TrackerRow, "receipt"> & { grocery_receipts: (TrackerRow["receipt"] & { area?: string | null; prices_only?: boolean | null }) | (TrackerRow["receipt"] & { area?: string | null; prices_only?: boolean | null })[] };
    const load = (cols: string) => fetchAll<Raw>((a, b) => {
      const q = supabase.from("grocery_items").select(`name, normalized_name, category, unit_price, quantity, unit, line_total, grocery_receipts!inner(${cols})`);
      return (forUser ? q.eq("user_id", forUser) : q).order("created_at", { ascending: false }).range(a, b) as never;
    });
    // Newest columns first: a database without the price-notes or receipt-country migration falls back to fewer
    const AREA = "store, purchase_date, currency, area";
    const data = await load(`${AREA}, prices_only, country`).catch(() => load(`${AREA}, prices_only`)).catch(() => load(AREA));
    // notebooks, clothes and other shopping lines are not grocery prices: they stay out of Best prices and what the community shares
    const shop = await fetchShoppingNames(supabase);
    const lines = data.filter((d) => !shop.has((d.category ?? "").trim().toLowerCase()) && (Array.isArray(d.grocery_receipts) ? d.grocery_receipts[0] : d.grocery_receipts)?.area !== "other").map((d) => ({
      name: d.name, normalized_name: d.normalized_name, category: d.category, unit_price: Number(d.unit_price), quantity: Number(d.quantity),
      unit: d.unit ?? null, line_total: Number(d.line_total),
      ...((Array.isArray(d.grocery_receipts) ? d.grocery_receipts[0] : d.grocery_receipts)?.prices_only ? { noted: true } : {}),
      receipt: Array.isArray(d.grocery_receipts) ? d.grocery_receipts[0] : d.grocery_receipts,
    }));
    // Prices seen in a shop sit beside the receipt lines. Before the price-notes migration there is no table: that just means none yet.
    const seenWith = (cols: string) => { const q = supabase.from("price_checks").select(cols); return (forUser ? q.eq("user_id", forUser) : q).order("seen_on", { ascending: false }).limit(2000); };
    let seen = await seenWith(`${PRICE_CHECK_COLS}, country`); // before the receipt-country migration there is no country column
    if (seen.error) seen = await seenWith(PRICE_CHECK_COLS);
    const checks = seen.error ? [] : ((seen.data ?? []) as unknown as PriceCheck[]).map(checkToTracker);
    return { data: [...lines, ...checks], error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Your Yes / No answers on "same product?". Before the migration is run there is no table: that simply means no answers yet. */
export async function fetchPriceMatches(supabase: SupabaseClient, forUser?: string): Result<MatchDecision[]> {
  try {
    const q = supabase.from("grocery_price_matches").select("key_a, key_b, same");
    const { data, error } = await (forUser ? q.eq("user_id", forUser) : q).limit(2000);
    if (error) return { data: [], error: null };
    return { data: (data ?? []).map((d) => ({ key_a: String(d.key_a), key_b: String(d.key_b), same: d.same === true })), error: null };
  } catch {
    return { data: [], error: null };
  }
}

export async function fetchReceiptBundle(supabase: SupabaseClient, id: string): Result<ReceiptBundle> {
  const [r, i] = await Promise.all([
    (async () => {
      // Newest columns first; each migration that has not been run drops one level
      const levels = [`${GROCERY_RECEIPT_COLS_PAY}, type_id, country`, `${GROCERY_RECEIPT_COLS_PAY}, type_id`, GROCERY_RECEIPT_COLS_PAY, GROCERY_RECEIPT_COLS, GROCERY_RECEIPT_COLS_BASE];
      let res = await supabase.from("grocery_receipts").select(levels[0]).eq("id", id).single();
      for (let n = 1; n < levels.length && isMissingColumn(res.error); n++) res = await supabase.from("grocery_receipts").select(levels[n]).eq("id", id).single();
      return res;
    })(),
    supabase.from("grocery_items").select(GROCERY_ITEM_COLS).eq("receipt_id", id).order("created_at"),
  ]);
  if (r.error || !r.data) return { data: null, error: r.error ?? new Error("Receipt not found") };
  if (i.error) return { data: null, error: i.error };
  const receipt = { ...(r.data as unknown as GroceryReceipt), total: Number((r.data as unknown as { total: number }).total) };
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
