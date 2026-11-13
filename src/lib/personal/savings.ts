/**
 * Savings plans: an amount put aside every month, with no end or until a date. Pure functions, so they can be tested
 * without a database.
 *
 * A plan's deposit falls on the same day of each month as its first deposit (the 31st becomes the last day of a short
 * month). A month can be skipped, one-off extra deposits can be added, and a plan can be paused. What is saved so far is
 * what you had before (opening balance) plus every deposit whose day has passed. In the monthly budget a month's deposit
 * counts for the whole month, because that money is already set aside.
 */
import { convert, round2, type BudgetCurrency } from "@/lib/personal/budget";
import { monthLabel, shiftMonth } from "@/lib/personal/utilities";

export type SavingsPlan = {
  id: string; name: string; amount: number; currency: BudgetCurrency;
  /** first deposit, YYYY-MM-DD */
  start_date: string;
  /** last deposit, or null for no end */
  end_date: string | null;
  /** saved before the plan started */
  opening_balance: number;
  goal: number | null;
  /** Periods with no deposits: from the day it was paused up to (not including) the day it was resumed; `to` is null while still paused. */
  pauses: Pause[];
};
export type Pause = { from: string; to: string | null };
export type SavingsEvent = { id?: string; plan_id: string; kind: "skip" | "extra"; month: string; amount: number | null };
export type DepositStatus = "counted" | "coming" | "skipped" | "extra";
export type Deposit = { month: string; date: string; amount: number; status: DepositStatus };

const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
const dimOf = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

export function readPlan(r: { id: string; name: string; amount: number | string; currency: string; start_date: string; end_date?: string | null; opening_balance?: number | string | null; goal?: number | string | null; paused_on?: string | null; pauses?: unknown }): SavingsPlan {
  return {
    id: r.id, name: r.name, amount: Number(r.amount), currency: r.currency === "USD" ? "USD" : "AWG",
    start_date: r.start_date, end_date: r.end_date ?? null, opening_balance: Number(r.opening_balance) || 0,
    goal: r.goal != null && Number(r.goal) > 0 ? Number(r.goal) : null, pauses: readPauses(r.pauses, r.paused_on),
  };
}
/** Pause periods from the saved list; a plan paused before periods existed has only the old single pause date. */
export function readPauses(raw: unknown, pausedOn?: string | null): Pause[] {
  const out: Pause[] = [];
  if (Array.isArray(raw)) for (const p of raw as { from?: unknown; to?: unknown }[]) if (p && typeof p.from === "string") out.push({ from: p.from, to: typeof p.to === "string" ? p.to : null });
  if (!out.length && pausedOn) out.push({ from: pausedOn, to: null });
  return out;
}
/** Whether the plan is paused right now. */
export const isPaused = (plan: SavingsPlan) => plan.pauses.some((p) => !p.to);
/** The pause list after pausing today, or after resuming today (the open pause is closed, so the months in between stay empty). */
export const pausedToday = (plan: SavingsPlan, today: string): Pause[] => (isPaused(plan) ? plan.pauses : [...plan.pauses, { from: today, to: null }]);
export const resumedToday = (plan: SavingsPlan, today: string): Pause[] => plan.pauses.map((p) => (p.to ? p : { ...p, to: today }));

export const readEvent = (r: { id?: string; plan_id: string; kind: string; month: string; amount?: number | string | null }): SavingsEvent =>
  ({ id: r.id, plan_id: r.plan_id, kind: r.kind === "skip" ? "skip" : "extra", month: r.month, amount: r.amount == null ? null : Number(r.amount) });

/** The day a month's deposit falls on. */
export function depositDate(plan: SavingsPlan, month: string): string {
  const day = Math.min(Number(plan.start_date.slice(8, 10)), dimOf(month));
  return `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** Whether the plan still deposits on that date (not before the start, after the end, or from a pause). */
const active = (plan: SavingsPlan, date: string) => date >= plan.start_date && (!plan.end_date || date <= plan.end_date) && !plan.pauses.some((p) => date >= p.from && (!p.to || date < p.to));

/** Every month's scheduled deposit from the first one up to `lastMonth` (YYYY-MM-01), skipped ones marked. */
function scheduled(plan: SavingsPlan, events: SavingsEvent[], lastMonth: string, today: string): Deposit[] {
  const skips = new Set(events.filter((e) => e.plan_id === plan.id && e.kind === "skip").map((e) => e.month));
  const out: Deposit[] = [];
  for (let m = monthOf(plan.start_date); m <= lastMonth && out.length < 1200; m = shiftMonth(m, 1)) {
    const date = depositDate(plan, m);
    if (!active(plan, date)) continue;
    out.push({ month: m, date, amount: plan.amount, status: skips.has(m) ? "skipped" : date <= today ? "counted" : "coming" });
  }
  return out;
}

/** The deposits to show: everything so far, the next one, and any extras, newest first. For a plan with an end, all of it. */
export function deposits(plan: SavingsPlan, events: SavingsEvent[], today: string): Deposit[] {
  const thisMonth = monthOf(today);
  const last = plan.end_date ? monthOf(plan.end_date) : shiftMonth(thisMonth, 1);
  const list = scheduled(plan, events, last, today);
  // for an ended plan, only the next coming deposit is shown among the future ones
  let seenComing = false;
  const shown = list.filter((d) => { if (d.status !== "coming") return true; if (seenComing) return false; seenComing = true; return true; });
  const extras: Deposit[] = events.filter((e) => e.plan_id === plan.id && e.kind === "extra" && e.amount).map((e) => ({ month: e.month, date: e.month, amount: Number(e.amount), status: "extra" as const }));
  return [...shown, ...extras].sort((a, b) => b.date.localeCompare(a.date));
}

/** Saved so far: the opening balance, deposits whose day has passed and extras. */
export function savedSoFar(plan: SavingsPlan, events: SavingsEvent[], today: string): number {
  const last = plan.end_date ? monthOf(plan.end_date) : monthOf(today);
  const paid = scheduled(plan, events, last, today).filter((d) => d.status === "counted").reduce((t, d) => t + d.amount, 0);
  const extra = events.filter((e) => e.plan_id === plan.id && e.kind === "extra" && e.month <= today).reduce((t, e) => t + Number(e.amount ?? 0), 0);
  return round2(plan.opening_balance + paid + extra);
}

/** Deposits still to come and what the plan reaches in the end. Null when the plan has no end. */
export function remaining(plan: SavingsPlan, events: SavingsEvent[], today: string): { count: number; endsAt: number } | null {
  if (!plan.end_date) return null;
  const list = scheduled(plan, events, monthOf(plan.end_date), today).filter((d) => d.status === "coming");
  const saved = savedSoFar(plan, events, today);
  return { count: list.length, endsAt: round2(saved + list.length * plan.amount) };
}

/** What the plans put aside in one month (YYYY-MM-01): that month's deposits, skipped ones left out, plus extras added then. */
export function monthSavings(plans: SavingsPlan[], events: SavingsEvent[], month: string): { amount: number; currency: string }[] {
  const out: { amount: number; currency: string }[] = [];
  for (const p of plans) {
    const d = scheduled(p, events, month, "0000-00-00").find((x) => x.month === month);
    if (d && d.status !== "skipped") out.push({ amount: p.amount, currency: p.currency });
    for (const e of events) if (e.plan_id === p.id && e.kind === "extra" && e.month === month && e.amount) out.push({ amount: Number(e.amount), currency: p.currency });
  }
  return out;
}

/** The total saved across the plans on one date, in the given currency. */
export function savedOn(plans: SavingsPlan[], events: SavingsEvent[], date: string, currency: BudgetCurrency): number {
  return round2(plans.reduce((t, p) => {
    if (date < p.start_date.slice(0, 7) + "-01") return t + (convert(p.opening_balance, p.currency, currency) ?? 0);
    return t + (convert(savedSoFar(p, events, date), p.currency, currency) ?? 0);
  }, 0));
}

/** Total saved at the end of each of the last `n` months (the current month up to today). */
export function monthlyTotals(plans: SavingsPlan[], events: SavingsEvent[], today: string, currency: BudgetCurrency, n = 6): { month: string; total: number }[] {
  const out: { month: string; total: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const month = shiftMonth(monthOf(today), -i);
    const end = i === 0 ? today : `${month.slice(0, 8)}${String(dimOf(month)).padStart(2, "0")}`;
    out.push({ month, total: savedOn(plans, events, end, currency) });
  }
  return out;
}

export const progressPct = (saved: number, goal: number | null) => (goal ? Math.min(100, Math.round((saved / goal) * 100)) : null);

/** "Every month, no end date" or "Every month until Dec 2027". */
export function ruleText(plan: SavingsPlan): string {
  if (!plan.end_date) return "Every month, no end date";
  const [name, year] = monthLabel(monthOf(plan.end_date)).split(" ");
  return `Every month until ${name.slice(0, 3)} ${year}`;
}

/** How many deposits a plan with an end makes from its first to its last, and their total. */
export function plannedDeposits(startDate: string, endDate: string, amount: number): { count: number; total: number } {
  const plan: SavingsPlan = { id: "", name: "", amount, currency: "AWG", start_date: startDate, end_date: endDate, opening_balance: 0, goal: null, pauses: [] };
  const count = scheduled(plan, [], monthOf(endDate), "0000-00-00").length;
  return { count, total: round2(count * amount) };
}

/** The totals shown for all plans together, the same on the Personal tile and on the Savings page. Currency is the first plan's unless one is given. */
export function savingsSummary(plans: SavingsPlan[], events: SavingsEvent[], today: string, show?: BudgetCurrency): { currency: BudgetCurrency; saved: number; monthly: number; plans: number } | null {
  if (!plans.length) return null;
  const currency = show ?? plans[0].currency;
  const saved = plans.reduce((t, p) => t + (convert(savedSoFar(p, events, today), p.currency, currency) ?? 0), 0);
  const monthly = plans.filter((p) => !isPaused(p) && p.start_date <= today && (!p.end_date || p.end_date >= today)).reduce((t, p) => t + (convert(p.amount, p.currency, currency) ?? 0), 0);
  return { currency, saved: round2(saved), monthly: round2(monthly), plans: plans.length };
}
