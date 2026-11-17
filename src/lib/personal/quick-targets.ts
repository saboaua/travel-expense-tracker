/** Quick spend destinations: one amount, saved where it belongs (a grocery total, a fuel fill-up, a utility bill) or as an everyday spend. Pure, so it is unit-tested. */

export type Dest = "groceries" | "fuel" | "utilities" | "everyday";
export const DESTS: { id: Dest; label: string }[] = [
  { id: "groceries", label: "Groceries" }, { id: "fuel", label: "Fuel" }, { id: "utilities", label: "Utilities" }, { id: "everyday", label: "Everyday" },
];
export const isDest = (v: unknown): v is Dest => DESTS.some((d) => d.id === v);
export const DEST_KEY = "lifolio.quickDest";

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The names you use most (stores, stations), most used first. Rows come newest first, so the newest spelling and the newest win ties. */
export function topNames(names: (string | null | undefined)[], limit = 6): string[] {
  const by = new Map<string, { name: string; count: number; first: number }>();
  names.forEach((raw, i) => {
    const name = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!name) return;
    const k = norm(name);
    const cur = by.get(k);
    if (cur) cur.count++; else by.set(k, { name, count: 1, first: i });
  });
  return [...by.values()].sort((a, b) => b.count - a.count || a.first - b.first).slice(0, limit).map((x) => x.name);
}

/** A grocery receipt with a store and a total and no items. Null when the store or the amount is missing. */
export function groceryTotalRow(i: { store: string; date: string; amount: number; currency: string }): { store: string; purchase_date: string; total: number; currency: string; notes: null } | null {
  const store = i.store.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!store || !(i.amount > 0)) return null;
  return { store, purchase_date: i.date, total: r2(i.amount), currency: i.currency, notes: null };
}

/** A fuel fill-up that is just the total (litres and price per litre are optional and left empty). */
export function fuelTotalRow(i: { date: string; amount: number; currency: string; usd: number; station: string; unit?: "L" | "gal"; quantity?: number | null }): Record<string, unknown> | null {
  if (!(i.amount > 0)) return null;
  const q = i.quantity && i.quantity > 0 ? i.quantity : null;
  return { fill_date: i.date, unit: i.unit ?? "L", quantity: q, price_per_unit: q ? Math.round((i.amount / q) * 10000) / 10000 : null, amount: r2(i.amount), currency: i.currency, amount_usd: r2(i.usd), station: i.station.trim().slice(0, 120) || null };
}

/** True for a grocery receipt with a total and no item lines: shown as "Total only". Receipts kept only for prices are not counted. */
export function isTotalOnly(r: { id: string; prices_only?: boolean | null }, withItems: Set<string>): boolean {
  return !r.prices_only && !withItems.has(r.id);
}
