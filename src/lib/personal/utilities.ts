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

export type UtilityLine = { kind: string; bills: BillRow[]; status: "paid" | "unpaid" | "missing"; usd: number; provider: string | null };

/** One line for each utility you have ever added a bill for, plus any other with a bill this month. */
export function monthLines(rows: BillRow[], month: string): UtilityLine[] {
  const order = UTILITY_KINDS.map((k) => k.id as string);
  const kinds = [...new Set(rows.map((r) => r.kind))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return kinds.map((kind) => {
    const bills = rows.filter((r) => r.kind === kind && r.bill_month === month);
    const status = bills.length === 0 ? "missing" : bills.every((b) => !!b.paid_on) ? "paid" : "unpaid";
    return { kind, bills, status, usd: totalUsd(bills), provider: lastProvider(rows, kind) };
  });
}

/** The company you used last for a utility (newest bill first). */
export function lastProvider(rows: BillRow[], kind: string): string | null {
  const mine = rows.filter((r) => r.kind === kind && r.provider?.trim()).sort((a, b) => b.bill_month.localeCompare(a.bill_month));
  return mine[0]?.provider?.trim() ?? null;
}

/** This month's total against last month's; change is null when last month has no bills. */
export function monthChange(rows: BillRow[], month: string): { total: number; previous: number; change: number | null } {
  const total = totalUsd(rows.filter((r) => r.bill_month === month));
  const previous = totalUsd(rows.filter((r) => r.bill_month === shiftMonth(month, -1)));
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

/** Utilities you pay regularly (a bill in an earlier month) with no bill yet for `month`. Used by the reminder. */
export function missingKinds(rows: { kind: string; bill_month: string }[], month: string): string[] {
  const seen = new Set(rows.filter((r) => r.bill_month < month).map((r) => r.kind));
  const have = new Set(rows.filter((r) => r.bill_month === month).map((r) => r.kind));
  return [...seen].filter((k) => !have.has(k));
}

/** "2026-11-05" is due soon/late relative to today; only for bills not paid yet. */
export function dueState(bill: BillRow, today: string): "late" | "soon" | null {
  if (bill.paid_on || !bill.due_date) return null;
  if (bill.due_date < today) return "late";
  const d = (Date.parse(bill.due_date) - Date.parse(today)) / 86400000;
  return d <= 7 ? "soon" : null;
}
