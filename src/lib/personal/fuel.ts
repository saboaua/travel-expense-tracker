/**
 * Fuel tracker: each time the tank is filled. Total paid, price per unit and quantity (litres or US gallons): any two give the third,
 * or only the total is kept. Pure functions, so they are unit-tested.
 */
import { convert, round2, type BudgetCurrency } from "@/lib/personal/money";
import { addDaysISO } from "@/lib/utils";

export type FuelUnit = "L" | "gal";
export const L_PER_GAL = 3.785411784;
export const FUEL_COLS = "id, fill_date, unit, quantity, price_per_unit, amount, currency, amount_usd, station";
export type FuelRow = { id: string; fill_date: string; unit: FuelUnit; quantity: number | string | null; price_per_unit: number | string | null; amount: number | string; currency: string; amount_usd?: number | string | null; station: string | null };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r = (n: number, d: number) => { const f = 10 ** d; return Math.round(n * f) / f; };

export const unitName = (u: FuelUnit) => (u === "gal" ? "gallon" : "litre");
export const unitShort = (u: FuelUnit) => (u === "gal" ? "gal" : "L");
export const toLitres = (q: number, u: FuelUnit) => (u === "gal" ? q * L_PER_GAL : q);
export const fromLitres = (l: number, u: FuelUnit) => (u === "gal" ? l / L_PER_GAL : l);
/** A quantity or price entered in one unit, shown in another. Prices go the other way: per gallon is per litre times 3.785. */
export const convertQty = (q: number, from: FuelUnit, to: FuelUnit) => (from === to ? q : fromLitres(toLitres(q, from), to));
export const convertPrice = (p: number, from: FuelUnit, to: FuelUnit) => (from === to ? p : p * (to === "gal" ? L_PER_GAL : 1 / L_PER_GAL));

/** "4.5", "4,50" -> 4.5; empty, zero or negative -> null. */
export function parsePositive(text: string): number | null {
  const n = Number(String(text ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type Solved = { total: number; price: number | null; qty: number | null; worked: "total" | "price" | "qty" | null };

/** Any two of total, price per unit and quantity give the third. Only a total is fine too. The total you type always wins. */
export function solveFillup(i: { total: number | null; price: number | null; qty: number | null }): Solved | { error: string } {
  const { total, price, qty } = i;
  if (total != null) {
    if (price != null && qty == null) return { total: r(total, 2), price: r(price, 3), qty: r(total / price, 2), worked: "qty" };
    if (qty != null && price == null) return { total: r(total, 2), price: r(total / qty, 3), qty: r(qty, 2), worked: "price" };
    return { total: r(total, 2), price: price == null ? null : r(price, 3), qty: qty == null ? null : r(qty, 2), worked: null };
  }
  if (price != null && qty != null) return { total: r(price * qty, 2), price: r(price, 3), qty: r(qty, 2), worked: "total" };
  return { error: "Enter the total paid, or the price and the amount." };
}

/** What a fill-up says under its date: "23.26 L · AWG 2.15 per L", or "Total only". */
export function fillupSub(f: Pick<FuelRow, "quantity" | "price_per_unit" | "unit" | "currency">): string {
  const q = f.quantity == null ? null : num(f.quantity);
  const p = f.price_per_unit == null ? null : num(f.price_per_unit);
  const parts: string[] = [];
  if (q) parts.push(`${r(q, 2)} ${unitShort(f.unit)}`);
  if (p) parts.push(`${f.currency} ${p.toFixed(2)} per ${unitShort(f.unit)}`);
  return parts.length ? parts.join(" · ") : "Total only";
}

export type FuelSummary = { total: number; currency: BudgetCurrency; count: number; /** in the unit asked for; null when no fill-up has an amount */ volume: number | null; /** average price per unit over the fill-ups with an amount; null when unknown */ avgPrice: number | null; skipped: number };

/** One month's (or any list of) fill-ups as a total in AWG or USD, the volume bought and the average price per unit. */
export function fuelSummary(rows: FuelRow[] | null | undefined, show: BudgetCurrency, unit: FuelUnit): FuelSummary | null {
  if (!rows?.length) return null;
  let total = 0, skipped = 0, vol = 0, volPaid = 0;
  for (const f of rows) {
    const v = convert(num(f.amount), f.currency, show, f.amount_usd == null ? null : num(f.amount_usd));
    if (v == null) { skipped++; continue; }
    total += v;
    if (f.quantity != null && num(f.quantity) > 0) { vol += convertQty(num(f.quantity), f.unit, unit); volPaid += v; }
  }
  return { total: round2(total), currency: show, count: rows.length, volume: vol > 0 ? r(vol, 1) : null, avgPrice: vol > 0 ? r(volPaid / vol, 2) : null, skipped };
}

/** The last few months, newest first, as month start (YYYY-MM-01) and total in the shown currency. Months with no fill-up are left out. */
export function fuelMonths(rows: FuelRow[], show: BudgetCurrency, count = 6): { month: string; total: number }[] {
  const by = new Map<string, number>();
  for (const f of rows) {
    const v = convert(num(f.amount), f.currency, show, f.amount_usd == null ? null : num(f.amount_usd));
    if (v == null) continue;
    const m = `${f.fill_date.slice(0, 7)}-01`;
    by.set(m, (by.get(m) ?? 0) + v);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, count).map(([month, total]) => ({ month, total: round2(total) }));
}

/** First day of the month `n` months back (n = 0 is this month). */
export const monthBack = (today: string, n: number): string => {
  let d = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < n; i++) d = addDaysISO(d, -1).slice(0, 7) + "-01";
  return d;
};

/** The currency a list is shown in: AWG or USD, whichever more fill-ups use (a tie gives AWG). */
export const fuelCurrency = (rows: { currency: string }[]): BudgetCurrency => (rows.filter((x) => x.currency === "USD").length > rows.filter((x) => x.currency === "AWG").length ? "USD" : "AWG");
