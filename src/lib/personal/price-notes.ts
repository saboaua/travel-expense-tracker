/** Prices you keep without spending: receipts for something you did not pay for, and prices seen in a shop. */
import { normalizeItemName, type TrackerRow } from "@/lib/personal/grocery";

/** A receipt counts toward spending unless it is kept for its prices only. */
export const isSpending = (r: { prices_only?: boolean | null }) => r.prices_only !== true;

/** The same result with prices-only receipts taken out of its rows. `Row` is the shape the caller selected. */
export function onlySpending<Row, T extends { data: unknown; error?: unknown } = { data: unknown; error?: unknown }>(res: { data: unknown; error: unknown } & Partial<T>): { data: Row[] | null; error: { message?: string } | null } {
  const rows = Array.isArray(res.data) ? (res.data as { prices_only?: boolean | null }[]).filter(isSpending) : null;
  return { data: rows as unknown as Row[] | null, error: res.error as { message?: string } | null };
}

/** The currency you used last at a store (store names match without caring about case or spaces). */
export function currencyForStore(receipts: { store: string; currency: string; purchase_date: string }[], store: string): string | null {
  const key = store.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  const mine = receipts.filter((r) => r.store.trim().toLowerCase().replace(/\s+/g, " ") === key).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
  return mine[0]?.currency ?? null;
}

/** A line with a price but no name (some receipts only say "1 ITEM") is saved as Item 1, 2, 3. */
export const itemName = (name: string, position: number) => name.trim() || `Item ${position}`;

export type PriceCheck = { id: string; product: string; store: string; price: number | string; currency: string; size?: string | null; seen_on: string; photo_path?: string | null; notes?: string | null; waiting?: boolean };

/** A price seen in a shop, shaped like a receipt line so the Price tracker compares it with everything else. The size goes into the name so same-size products pair up. */
export function checkToTracker(c: PriceCheck): TrackerRow {
  const name = [c.product.trim(), c.size?.trim()].filter(Boolean).join(" ");
  const price = Math.round(Number(c.price) * 100) / 100;
  return { name, normalized_name: normalizeItemName(name), category: "Other", unit_price: price, quantity: 1, unit: null, line_total: price, receipt: { store: c.store.trim(), purchase_date: c.seen_on, currency: c.currency } };
}

/** Products you checked before, most checked first (case-insensitive), for one-tap chips. */
export function recentProducts(rows: PriceCheck[], limit = 4): string[] {
  const by = new Map<string, { name: string; count: number; last: string }>();
  for (const r of rows) {
    const name = r.product.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    const cur = by.get(k);
    if (!cur) by.set(k, { name, count: 1, last: r.seen_on });
    else { cur.count++; if (r.seen_on > cur.last) cur.last = r.seen_on; }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit).map((x) => x.name);
}

/** Shops you have used for price checks or receipts, most used first. */
export function knownStores(names: string[], limit = 6): string[] {
  const by = new Map<string, { name: string; count: number }>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const k = name.toLowerCase().replace(/\s+/g, " ");
    const cur = by.get(k);
    if (cur) cur.count++; else by.set(k, { name, count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, limit).map((x) => x.name);
}
