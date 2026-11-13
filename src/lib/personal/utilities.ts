import { AWG_PER_USD } from "@/lib/personal/dashboard";
/** Utility bills you add yourself (no link to the companies): water, electricity, septic, trash, phone, internet. */

export const UTILITY_KINDS = [
  { id: "water", label: "Water" },
  { id: "electricity", label: "Electricity" },
  { id: "septic", label: "Septic" },
  { id: "trash", label: "Trash" },
  { id: "phone", label: "Phone" },
  { id: "internet", label: "Internet" },
  { id: "other", label: "Other" },
] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number]["id"];
export const kindLabel = (k: string) => UTILITY_KINDS.find((x) => x.id === k)?.label ?? "Other";
export const isKind = (k: unknown): k is UtilityKind => UTILITY_KINDS.some((x) => x.id === k);

export type BillRow = {
  id: string; kind: string; provider?: string | null; bill_month: string;
  amount: number | string; currency: string; exchange_rate?: number | string | null; amount_usd?: number | string | null;
  paid_on?: string | null; due_date?: string | null; receipt_path?: string | null; notes?: string | null; waiting?: boolean;
  /** "email" when the bill came in by forwarded email; needs_check when its month was guessed or its amount was missing */
  source?: string | null; needs_check?: boolean | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Any date -> first of its month, "2026-11-14" -> "2026-11-01". */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Move a first-of-month date by n months (may be negative). */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
export const monthShort = (month: string) => (MONTHS[Number(month.slice(5, 7)) - 1] ?? "").slice(0, 3);

export const totalUsd = (rows: BillRow[]) => r2(rows.reduce((s, r) => s + num(r.amount_usd), 0));

/** The month a payment counts in: the month it was paid (cash basis). Unpaid bills count nowhere yet. */
export const payMonth = (b: { paid_on?: string | null }) => (b.paid_on ? monthStart(b.paid_on) : null);

/** Bills paid in `month`, newest payment first. Each still says which month it is for (bill_month). */
export function paidIn(rows: BillRow[], month: string): BillRow[] {
  return rows.filter((r) => payMonth(r) === month).sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""));
}

/** Bills not paid yet, soonest due first (no due date last). */
export function dueBills(rows: BillRow[]): BillRow[] {
  return rows.filter((r) => !r.paid_on).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.bill_month.localeCompare(b.bill_month));
}

/** Whole months from the month a bill is for to the month it was paid ("September" bill paid in November = 2). */
const lagOf = (b: { bill_month: string; paid_on?: string | null }) => {
  if (!b.paid_on) return null;
  const n = (Number(b.paid_on.slice(0, 4)) - Number(b.bill_month.slice(0, 4))) * 12 + Number(b.paid_on.slice(5, 7)) - Number(b.bill_month.slice(5, 7));
  return n >= 0 && n <= 6 ? n : null;
};

/** How many months back a utility's bill usually is when you pay it: your latest paid bill of that company (or of that utility). One month when there is no history. */
export function usualLag(rows: BillRow[], kind: string, provider?: string | null): number {
  const paid = rows.filter((r) => r.kind === kind && lagOf(r) != null).sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""));
  const co = provider?.trim().toLowerCase();
  const pick = (co ? paid.find((r) => r.provider?.trim().toLowerCase() === co) : null) ?? paid[0];
  return pick ? (lagOf(pick) as number) : 1;
}

/** The month a bill paid on `paidOn` is probably for. */
export const defaultBillMonth = (paidOn: string, lag: number) => shiftMonth(monthStart(paidOn), -lag);

/** The company you used last for a utility (newest bill first). */
export function lastProvider(rows: BillRow[], kind: string): string | null {
  const mine = rows.filter((r) => r.kind === kind && r.provider?.trim()).sort((a, b) => b.bill_month.localeCompare(a.bill_month));
  return mine[0]?.provider?.trim() ?? null;
}

/** What you paid this month against last month; change is null when nothing was paid last month. */
export function monthChange(rows: BillRow[], month: string): { total: number; previous: number; change: number | null } {
  const total = totalUsd(paidIn(rows, month));
  const previous = totalUsd(paidIn(rows, shiftMonth(month, -1)));
  return { total, previous, change: previous > 0 ? r2(total - previous) : null };
}

/** The last six months ending at `month` for one utility, with the average and the highest month that had a bill. */
export function history(rows: BillRow[], kind: string, month: string): { bars: { month: string; usd: number }[]; average: number; highest: number } {
  const mine = rows.filter((r) => r.kind === kind);
  const bars = [-5, -4, -3, -2, -1, 0].map((n) => {
    const m = shiftMonth(month, n);
    return { month: m, usd: totalUsd(mine.filter((r) => r.bill_month === m)) };
  });
  const withBills = bars.filter((b) => b.usd > 0);
  return {
    bars,
    average: withBills.length ? r2(withBills.reduce((s, b) => s + b.usd, 0) / withBills.length) : 0,
    highest: withBills.length ? Math.max(...withBills.map((b) => b.usd)) : 0,
  };
}

/** Utilities you usually pay (paid in an earlier month) with nothing paid or waiting to be paid for `month`. Used by the reminder. */
export function missingKinds(rows: { kind: string; paid_on?: string | null }[], month: string): string[] {
  const before = new Set(rows.filter((r) => r.paid_on && monthStart(r.paid_on) < month).map((r) => r.kind));
  const have = new Set(rows.filter((r) => !r.paid_on || monthStart(r.paid_on) === month).map((r) => r.kind));
  return [...before].filter((k) => !have.has(k));
}

/** "2026-11-05" is due soon/late relative to today; only for bills not paid yet. */
export function dueState(bill: BillRow, today: string): "late" | "soon" | null {
  if (bill.paid_on || !bill.due_date) return null;
  if (bill.due_date < today) return "late";
  const d = (Date.parse(bill.due_date) - Date.parse(today)) / 86400000;
  return d <= 7 ? "soon" : null;
}

/** A USD amount in florins (AWG, shown as Afl.), at the fixed peg of 1.79 florins to the dollar. */
export const toAwg = (usd: number) => Math.round((Number(usd) || 0) * AWG_PER_USD * 100) / 100;
