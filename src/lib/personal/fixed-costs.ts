/**
 * Fixed costs: home mortgage, insurance, car loan, car insurance, license plate, credit card and a gambling limit.
 * A payment is set once and added to the month's spending when it is due. Pure functions, so they are unit-tested.
 *
 * - monthly payments count in every month from start to end (no end: for ever)
 * - yearly bills (car insurance, license plate) count only in the month they are due
 * - a credit card is either one amount every month, or the statement total you enter for each month
 * - gambling is not a payment: you enter what you spent, and it is compared with the most you can afford each month
 */
import { convert, round2, type BudgetCurrency } from "@/lib/personal/money";

export const FIXED_KINDS = ["mortgage", "home_insurance", "car_loan", "car_insurance", "license_plate", "credit_card", "gambling"] as const;
export type FixedKind = (typeof FIXED_KINDS)[number];
export type FixedSchedule = "monthly" | "yearly" | "twice_yearly" | "statement" | "limit";
export type FixedCategory = "loans" | "insurances" | "cards" | "gambling";

export const KIND_LABEL: Record<FixedKind, string> = { mortgage: "Home mortgage", home_insurance: "Home insurance", car_loan: "Car loan", car_insurance: "Car insurance", license_plate: "License plate", credit_card: "Credit card", gambling: "Gambling limit" };
export const CATEGORY_LABEL: Record<FixedCategory, string> = { loans: "Loans", insurances: "Insurances", cards: "Credit card", gambling: "Gambling" };
export const KIND_CATEGORY: Record<FixedKind, FixedCategory> = { mortgage: "loans", car_loan: "loans", home_insurance: "insurances", car_insurance: "insurances", license_plate: "insurances", credit_card: "cards", gambling: "gambling" };
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type FixedCost = {
  id?: string; kind: FixedKind; schedule: FixedSchedule; amount: number; amount2: number | null; currency: BudgetCurrency;
  day: number | null; due_month: number | null; due_month2: number | null; start_month: string | null; end_month: string | null; active: boolean;
};
export type FixedEntry = { id?: string; kind: "card" | "gambling"; on_date: string; amount: number; currency: BudgetCurrency };
export type FixedLine = { kind: FixedKind; category: FixedCategory; amount: number; currency: BudgetCurrency };

const isKind = (k: unknown): k is FixedKind => (FIXED_KINDS as readonly string[]).includes(k as string);
const SCHEDULES: FixedSchedule[] = ["monthly", "yearly", "twice_yearly", "statement", "limit"];
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const monthOrNull = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null; };
const firstOfMonth = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? `${v.slice(0, 7)}-01` : null);

/** A database row as a FixedCost; null when it cannot be read. */
export function readCost(r: Record<string, unknown>): FixedCost | null {
  if (!isKind(r.kind) || !SCHEDULES.includes(r.schedule as FixedSchedule)) return null;
  return {
    id: typeof r.id === "string" ? r.id : undefined, kind: r.kind, schedule: r.schedule as FixedSchedule,
    amount: round2(num(r.amount)), amount2: r.amount2 == null ? null : round2(num(r.amount2)), currency: r.currency === "USD" ? "USD" : "AWG",
    day: r.day == null ? null : Math.min(28, Math.max(1, Math.round(num(r.day)))), due_month: monthOrNull(r.due_month), due_month2: monthOrNull(r.due_month2),
    start_month: firstOfMonth(r.start_month), end_month: firstOfMonth(r.end_month), active: r.active !== false,
  };
}

export const readEntry = (r: Record<string, unknown>): FixedEntry | null =>
  (r.kind === "card" || r.kind === "gambling") && typeof r.on_date === "string" && num(r.amount) > 0
    ? { id: typeof r.id === "string" ? r.id : undefined, kind: r.kind, on_date: r.on_date.slice(0, 10), amount: round2(num(r.amount)), currency: r.currency === "USD" ? "USD" : "AWG" }
    : null;

const monthKey = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Is this month inside the cost's start and end? */
export function inRange(c: Pick<FixedCost, "start_month" | "end_month">, month: string): boolean {
  const m = monthKey(month);
  if (c.start_month && m < c.start_month) return false;
  if (c.end_month && m > c.end_month) return false;
  return true;
}

/** What falls due in a month (month = YYYY-MM-01). Statement and gambling amounts come from entries, not from here. */
export function dueAmount(c: FixedCost, month: string): number {
  if (!c.active || !inRange(c, month)) return 0;
  const m = Number(month.slice(5, 7));
  if (c.schedule === "monthly") return c.amount;
  if (c.schedule === "yearly") return m === c.due_month ? c.amount : 0;
  if (c.schedule === "twice_yearly") return (m === c.due_month ? c.amount : 0) + (m === c.due_month2 ? c.amount2 ?? c.amount : 0);
  return 0;
}

/** Everything that adds to the month's spending, one line per cost (gambling and statements from the entries of that month). */
export function monthLines(costs: FixedCost[], entries: FixedEntry[], month: string): FixedLine[] {
  const out: FixedLine[] = [];
  const m = monthKey(month);
  const sum = (kind: FixedEntry["kind"], cur: BudgetCurrency) => round2(entries.filter((e) => e.kind === kind && monthKey(e.on_date) === m && e.currency === cur).reduce((t, e) => t + e.amount, 0));
  for (const c of costs) {
    if (!c.active) continue;
    if (c.schedule === "statement" || c.schedule === "limit") {
      const kind = c.schedule === "statement" ? "card" : "gambling";
      for (const cur of ["AWG", "USD"] as const) { const a = sum(kind, cur); if (a > 0) out.push({ kind: c.kind, category: KIND_CATEGORY[c.kind], amount: a, currency: cur }); }
      continue;
    }
    const a = dueAmount(c, month);
    if (a > 0) out.push({ kind: c.kind, category: KIND_CATEGORY[c.kind], amount: a, currency: c.currency });
  }
  // gambling spent without a limit set still counts
  if (!costs.some((c) => c.kind === "gambling")) for (const cur of ["AWG", "USD"] as const) { const a = sum("gambling", cur); if (a > 0) out.push({ kind: "gambling", category: "gambling", amount: a, currency: cur }); }
  return out;
}

/** Totals per category in the budget's currency */
export function totalsByCategory(lines: FixedLine[], currency: BudgetCurrency): Record<FixedCategory, number> {
  const out: Record<FixedCategory, number> = { loans: 0, insurances: 0, cards: 0, gambling: 0 };
  for (const l of lines) { const v = convert(l.amount, l.currency, currency); if (v != null) out[l.category] += v; }
  for (const k of Object.keys(out) as FixedCategory[]) out[k] = round2(out[k]);
  return out;
}

/** Which categories the person has set up (so their rows show even in a month with nothing due) */
export const configuredCategories = (costs: FixedCost[]): FixedCategory[] => [...new Set(costs.filter((c) => c.active).map((c) => KIND_CATEGORY[c.kind]))];

/** Gambling against the most you can afford each month */
export type GamblingState = "ok" | "near" | "over" | "none";
export function gamblingState(spent: number, limit: number | null): GamblingState {
  if (!limit || limit <= 0) return "none";
  if (spent > limit) return "over";
  return spent >= limit * 0.8 ? "near" : "ok";
}

const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));

/** Monthly payments still to come, this month included, and what they add up to. Null when there is no end date. */
export function paymentsLeft(c: FixedCost, today: string): { count: number; total: number } | null {
  if (c.schedule !== "monthly" || !c.end_month) return null;
  const from = c.start_month && monthKey(today) < c.start_month ? c.start_month : monthKey(today);
  const count = Math.max(0, monthsBetween(from, c.end_month) + 1);
  return { count, total: round2(count * c.amount) };
}

/** The next yearly payment (car insurance, license plate) from today. */
export function nextYearly(c: FixedCost, today: string): { date: string; amount: number } | null {
  if (!c.active || (c.schedule !== "yearly" && c.schedule !== "twice_yearly")) return null;
  const y = Number(today.slice(0, 4));
  const options: { date: string; amount: number }[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const [m, a] of [[c.due_month, c.amount], [c.due_month2, c.amount2 ?? c.amount]] as [number | null, number][]) {
    if (!m || (c.schedule === "yearly" && m !== c.due_month)) continue;
    for (const yy of [y, y + 1]) {
      const date = `${yy}-${pad(m)}-${pad(c.day ?? 1)}`;
      if (date >= today && inRange(c, `${yy}-${pad(m)}-01`)) options.push({ date, amount: a });
    }
  }
  return options.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** "Mar 2041" */
export const monthLabel = (m: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "");

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** A yearly bill within 30 days: step 30 while it is more than 7 days away, step 7 in the last 7 days (each step is alerted once). */
export function yearlyAlert(c: FixedCost, today: string): { step: 7 | 30; days: number; date: string } | null {
  const next = nextYearly(c, today);
  if (!next) return null;
  const days = daysBetween(today, next.date);
  if (days >= 0 && days <= 7) return { step: 7, days, date: next.date };
  if (days > 7 && days <= 30) return { step: 30, days, date: next.date };
  return null;
}

/** Does a monthly payment fall on this date? (its day of the month, inside its start and end) */
export function paymentFallsOn(c: FixedCost, date: string): boolean {
  return c.schedule === "monthly" && dueAmount(c, `${date.slice(0, 7)}-01`) > 0 && (c.day ?? 1) === Number(date.slice(8, 10));
}
