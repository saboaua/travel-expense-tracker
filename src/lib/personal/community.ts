/**
 * Community prices: what leaves the phone when someone opts in. Only store, item name and price (plus the pack size and currency, so
 * like is compared with like). No name, account, receipt, total, date or time, and nothing about the rest of the basket. The receipt
 * date stays on the phone: it is used only here, to skip old prices. Pure, so it is unit-tested.
 */
import { normStore } from "@/lib/personal/basket";
import { productWords, type Product } from "@/lib/personal/price-compare";
import { countryForShared } from "@/lib/country";

export type SharedRow = { store_key: string; store_name: string; product_key: string; product_name: string; size_label: string | null; currency: string; price: number; country?: string | null };
/** The only fields that may ever be sent. A test checks every row against this list. */
export const SHARED_FIELDS = ["store_key", "store_name", "product_key", "product_name", "size_label", "currency", "price", "country"] as const;

/** Same key for the same product however it is printed: "Coca-Cola 33CL" and "COCA COLA 330ML" */
export const productKey = (p: Pick<Product, "name" | "size" | "currency" | "unit">) => `${p.currency}|${[...productWords(p.name)].sort().join(" ")}|${p.size ?? ""}|${p.unit ?? ""}`;
export const storeKey = (store: string) => normStore(store).replace(/ /g, "");

const ageDays = (date: string, now: Date) => Math.round((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86400000);

/** One row per product and store: the latest price seen in the last 60 days. */
/** `current` is the country the person is in (or lives in): it is sent for currencies several countries use, like USD. */
export function sharedRows(products: Product[], now: Date, current: string | null = null): SharedRow[] {
  const out: SharedRow[] = [];
  for (const p of products) {
    if (!productWords(p.name).length) continue;
    for (const s of p.stores) {
      const age = ageDays(s.latest.date, now);
      if (age < 0 || age > 60 || !(s.latest.price > 0) || s.latest.price >= 100000) continue;
      const sk = storeKey(s.store);
      if (!sk) continue;
      out.push({ store_key: sk, store_name: s.store.slice(0, 120), product_key: productKey(p), product_name: p.name.slice(0, 160), size_label: p.size, currency: p.currency, price: Math.round(s.latest.price * 100) / 100, country: countryForShared(p.currency, current) });
    }
  }
  return out;
}

/** How many product-and-store prices were left out for being older than 60 days (they stay on the phone). */
export function oldPriceCount(products: Product[], now: Date): number {
  let n = 0;
  for (const p of products) for (const s of p.stores) if (ageDays(s.latest.date, now) > 60) n++;
  return n;
}

/** `reporters` is how many different shoppers paid about that price. `confirmed` is true when 3 or more paid within 5% of the middle price. */
export type CommunityRow = { product_key: string; product_name: string; size_label: string | null; currency: string; store_name: string; price: number; reporters: number; last_month: string; confirmed?: boolean };
/** Confirmed before the database said so (an older database): 3 or more shoppers. */
export const isConfirmed = (r: { reporters: number; confirmed?: boolean }) => r.confirmed ?? r.reporters >= 3;
/** What a price shows under it: "Seen by 1 shopper", "Seen by 2 shoppers", "Confirmed by 5 shoppers", or "3 shoppers, prices differ". */
export function shopperLabel(reporters: number, confirmed: boolean): string {
  const n = Math.max(1, Math.round(reporters));
  if (confirmed) return `Confirmed by ${n} shoppers`;
  if (n >= 3) return `${n} shoppers, prices differ`;
  return `Seen by ${n} shopper${n === 1 ? "" : "s"}`;
}
export type CommunityProduct = { key: string; name: string; size: string | null; currency: string; stores: { store: string; price: number; reporters: number; confirmed: boolean; lowest: boolean }[] };

/** Group the rows the database returned by product, cheapest store first; the lowest is marked. */
export function groupCommunity(rows: CommunityRow[]): CommunityProduct[] {
  const by = new Map<string, CommunityProduct>();
  for (const r of rows) {
    const g = by.get(`${r.product_key}`) ?? { key: r.product_key, name: r.product_name, size: r.size_label, currency: r.currency, stores: [] };
    g.stores.push({ store: r.store_name, price: Number(r.price), reporters: r.reporters, confirmed: isConfirmed(r), lowest: false });
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

/** "today", "yesterday" or "Nov 12": when the last nightly share ran, for the Profile card. Empty when it has not run yet. */
export function lastSharedLabel(at: string | null | undefined, now: Date): string {
  if (!at) return "";
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day(now) - day(new Date(t))) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type ShareResult = { sent: number; ready: number; old: number; error: boolean };

/** Sends the latest prices now. Used when sharing is turned on and by the "Share my prices now" button. */
export async function shareNow(supabase: SupabaseClient, uid: string, products: Product[], now: Date, country: string | null = null): Promise<ShareResult> {
  const rows = sharedRows(products, now, country);
  const old = oldPriceCount(products, now);
  let sent = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await supabase.rpc("share_prices", { rows: rows.slice(i, i + 300) });
    if (error) return { sent, ready: rows.length, old, error: true };
    sent += Number(data) || 0;
  }
  try { localStorage.setItem(`price-share-sync:${uid}`, now.toISOString().slice(0, 10)); } catch { /* fine */ }
  return { sent, ready: rows.length, old, error: false };
}

/**
 * community_search for one country. A database that has not had migration_country.sql run yet does not know the country argument:
 * then the same search is made without it (every country), so nothing stops working before the migration.
 */
export async function searchCommunity(supabase: SupabaseClient, args: { q?: string; keys?: string[] }, country: string | null): Promise<CommunityRow[]> {
  try {
    if (country) {
      const r = await supabase.rpc("community_search", { ...args, ctry: country });
      if (!r.error) return (r.data ?? []) as CommunityRow[];
    }
    const r = await supabase.rpc("community_search", args);
    return r.error ? [] : ((r.data ?? []) as CommunityRow[]);
  } catch { return []; }
}
