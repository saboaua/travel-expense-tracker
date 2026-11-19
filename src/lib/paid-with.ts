/** How a personal expense or receipt was paid, and the trip a personal receipt belongs to. Pure functions. */

export type PaidWith = "cash" | "debit" | "credit";
export const PAID_WITH: { id: PaidWith; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "debit", label: "Debit" },
  { id: "credit", label: "Credit card" },
];
export const paidLabel = (p: PaidWith | null | undefined) => (p === "credit" ? "Credit card" : p === "debit" ? "Debit card" : p === "cash" ? "Cash" : "Not set");
export const normPaid = (v: unknown): PaidWith | null => (v === "cash" || v === "debit" || v === "credit" ? v : null);

/** "trip:<id>" is a business trip, "ptrip:<id>" a personal trip. A label only. */
export type TripRef = string;
const REF = /^(trip|ptrip):[0-9a-f-]{36}$/i;
export const normTripRef = (v: unknown): TripRef | null => (typeof v === "string" && REF.test(v) ? v : null);

export type Pay = { paid_with: PaidWith | null; amount: number; currency: string };
export type PaidTotals = { credit: number; debit: number; cash: number; none: number; count: { credit: number; debit: number; cash: number; none: number }; total: number };

/** Totals per payment type for one currency. Rows in other currencies are left out; call it once per currency. */
export function paidTotals(rows: Pay[], currency: string): PaidTotals {
  const t: PaidTotals = { credit: 0, debit: 0, cash: 0, none: 0, count: { credit: 0, debit: 0, cash: 0, none: 0 }, total: 0 };
  for (const r of rows) {
    if (r.currency !== currency || !Number.isFinite(r.amount)) continue;
    const k = r.paid_with ?? "none";
    t[k] += r.amount; t.count[k]++; t.total += r.amount;
  }
  for (const k of ["credit", "debit", "cash", "none", "total"] as const) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

/** Currencies used, biggest total first, so the summary can show each one. */
export function currenciesOf(rows: { currency: string; amount: number }[]): string[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + Math.abs(r.amount));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export type TripChoice = { ref: TripRef; label: string; kind: "trip" | "ptrip"; start: string | null; end: string | null };

/** The trip that was on at this date: a business trip first, then a personal one. Null when none or when several fit a kind (the person picks). */
export function suggestTrip(trips: TripChoice[], date: string): TripChoice | null {
  const on = (t: TripChoice) => !!t.start && t.start <= date && date <= (t.end || t.start);
  for (const kind of ["trip", "ptrip"] as const) {
    const hits = trips.filter((t) => t.kind === kind && on(t));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

const KEY = "lifolio:paid-with";
export const lastPaid = (): PaidWith | null => { try { return normPaid(localStorage.getItem(KEY)); } catch { return null; } };
export const rememberPaid = (p: PaidWith | null) => { try { if (p) localStorage.setItem(KEY, p); } catch { /* private mode */ } };

export type Filter = { paid: PaidWith | "none" | null; trip: TripRef | "none" | null };
export function filterReceipts<T extends { paid_with?: PaidWith | null; trip_ref?: string | null }>(rows: T[], f: Filter): T[] {
  return rows.filter((r) => (f.paid == null || (f.paid === "none" ? !r.paid_with : r.paid_with === f.paid)) && (f.trip == null || (f.trip === "none" ? !r.trip_ref : r.trip_ref === f.trip)));
}
