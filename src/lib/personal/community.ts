/**
 * Community prices: what leaves the phone when someone opts in. Only store, item name and price (plus the pack size and currency, so
 * like is compared with like). No name, account, receipt, total, date or time, and nothing about the rest of the basket. The receipt
 * date stays on the phone: it is used only here, to skip old prices. Pure, so it is unit-tested.
 */
import { normStore } from "@/lib/personal/basket";
import { productWords, type Product } from "@/lib/personal/price-compare";

export type SharedRow = { store_key: string; store_name: string; product_key: string; product_name: string; size_label: string | null; currency: string; price: number };
/** The only fields that may ever be sent. A test checks every row against this list. */
export const SHARED_FIELDS = ["store_key", "store_name", "product_key", "product_name", "size_label", "currency", "price"] as const;

/** Same key for the same product however it is printed: "Coca-Cola 33CL" and "COCA COLA 330ML" */
export const productKey = (p: Pick<Product, "name" | "size" | "currency" | "unit">) => `${p.currency}|${[...productWords(p.name)].sort().join(" ")}|${p.size ?? ""}|${p.unit ?? ""}`;
export const storeKey = (store: string) => normStore(store).replace(/ /g, "");

const ageDays = (date: string, now: Date) => Math.round((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86400000);

/** One row per product and store: the latest price seen in the last 60 days. */
export function sharedRows(products: Product[], now: Date): SharedRow[] {
  const out: SharedRow[] = [];
  for (const p of products) {
    if (!productWords(p.name).length) continue;
    for (const s of p.stores) {
      const age = ageDays(s.latest.date, now);
      if (age < 0 || age > 60 || !(s.latest.price > 0) || s.latest.price >= 100000) continue;
      const sk = storeKey(s.store);
      if (!sk) continue;
      out.push({ store_key: sk, store_name: s.store.slice(0, 120), product_key: productKey(p), product_name: p.name.slice(0, 160), size_label: p.size, currency: p.currency, price: Math.round(s.latest.price * 100) / 100 });
    }
  }
  return out;
}

export type CommunityRow = { product_key: string; product_name: string; size_label: string | null; currency: string; store_name: string; price: number; reporters: number; last_month: string };
export type CommunityProduct = { key: string; name: string; size: string | null; currency: string; stores: { store: string; price: number; reporters: number; lowest: boolean }[] };

/** Group the rows the database returned by product, cheapest store first; the lowest is marked. */
export function groupCommunity(rows: CommunityRow[]): CommunityProduct[] {
  const by = new Map<string, CommunityProduct>();
  for (const r of rows) {
    const g = by.get(`${r.product_key}`) ?? { key: r.product_key, name: r.product_name, size: r.size_label, currency: r.currency, stores: [] };
    g.stores.push({ store: r.store_name, price: Number(r.price), reporters: r.reporters, lowest: false });
    by.set(r.product_key, g);
  }
  const out = [...by.values()];
  for (const g of out) { g.stores.sort((a, b) => a.price - b.price); if (g.stores.length > 1) g.stores[0].lowest = true; }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------- talking to the database (browser) ---------------- */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Is sharing on for this person? false when it is off or the migration has not been run. */
export async function sharingOn(supabase: SupabaseClient, uid: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("share_prices").eq("id", uid).single();
  return !error && data?.share_prices === true;
}

/** Sends the latest prices (once a day at most, unless forced). Returns how many rows were accepted. */
export async function syncSharedPrices(supabase: SupabaseClient, uid: string, products: Product[], now: Date, force = false): Promise<number> {
  const stamp = `price-share-sync:${uid}`;
  const today = now.toISOString().slice(0, 10);
  try { if (!force && localStorage.getItem(stamp) === today) return 0; } catch { /* storage can be blocked */ }
  if (!(await sharingOn(supabase, uid))) return 0;
  const rows = sharedRows(products, now);
  let n = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await supabase.rpc("share_prices", { rows: rows.slice(i, i + 300) });
    if (error) return n;
    n += Number(data) || 0;
  }
  try { localStorage.setItem(stamp, today); } catch { /* fine */ }
  return n;
}
