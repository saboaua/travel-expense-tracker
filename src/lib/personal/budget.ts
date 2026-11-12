/**
 * The monthly budget on Personal. Pure functions, so they can be tested without a database.
 *
 * One budget applies to every month; a budget saved for a single month wins over it for that month. What you spent is
 * added up from groceries, utilities, quick spends and house costs, in the budget's currency (AWG or USD, pegged at 1.79).
 */
import { AWG_PER_USD } from "@/lib/personal/dashboard";
import { HOUSE_CATEGORY } from "@/lib/personal/quick-spend";

export const BUDGET_AREAS = [
  { key: "groceries", label: "Groceries" },
  { key: "utilities", label: "Utilities" },
  { key: "quick", label: "Quick spend" },
  { key: "house", label: "House" },
] as const;
export type BudgetArea = (typeof BUDGET_AREAS)[number]["key"];
/** Savings is counted in the budget too, but it has no limit of its own: the plan itself is the limit. */
export type SpentArea = BudgetArea | "savings";
export type BudgetCurrency = "AWG" | "USD";
export type Limits = Partial<Record<BudgetArea, number>>;

export type BudgetSetting = { id?: string; month: string | null; amount: number; currency: BudgetCurrency; limits: Limits; alert_at_80: boolean };
export type BudgetState = "ok" | "near" | "over";

/** Near is 80% of the budget or more. */
export const NEAR_AT = 0.8;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Between AWG and USD only; any other currency has to come with its USD amount. */
export function convert(amount: number, from: string, to: BudgetCurrency, usd?: number | null): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  let inUsd: number | null = null;
  if (from === "USD") inUsd = amount;
  else if (from === "AWG") inUsd = amount / AWG_PER_USD;
  else if (usd != null && Number.isFinite(usd)) inUsd = usd;
  if (inUsd == null) return null;
  return to === "USD" ? inUsd : inUsd * AWG_PER_USD;
}

/** The budget that counts for a month (YYYY-MM-01): its own one, else the "every month" one, else none. */
export function pickBudget(rows: BudgetSetting[] | null | undefined, month: string): BudgetSetting | null {
  const list = rows ?? [];
  return list.find((r) => r.month === month) ?? list.find((r) => !r.month) ?? null;
}

export function cleanLimits(raw: unknown): Limits {
  const out: Limits = {};
  if (!raw || typeof raw !== "object") return out;
  for (const a of BUDGET_AREAS) {
    const n = Number((raw as Record<string, unknown>)[a.key]);
    if (Number.isFinite(n) && n > 0) out[a.key] = round2(n);
  }
  return out;
}

export function readBudget(r: { id?: string; month?: string | null; amount: number | string; currency: string; limits?: unknown; alert_at_80?: boolean | null }): BudgetSetting {
  return { id: r.id, month: r.month ?? null, amount: Number(r.amount), currency: r.currency === "USD" ? "USD" : "AWG", limits: cleanLimits(r.limits), alert_at_80: !!r.alert_at_80 };
}

export type MonthInputs = {
  groceries: { total: number | string; currency: string }[];
  utilities: { amount_usd: number | string | null }[];
  spends: { amount: number | string; currency: string; amount_usd?: number | string | null; category: string; project_id?: string | null; house_area?: string | null }[];
  /** costs of your home projects this month */
  projects: { amount_usd: number | string | null }[];
  /** what your savings plans put aside this month (optional: older callers have none) */
  savings?: { amount: number; currency: string }[];
};

/** A quick spend that belongs to the house: the House category, a home project or an area of the house. */
export const isHouseSpend = (s: { category: string; project_id?: string | null; house_area?: string | null }) => s.category === HOUSE_CATEGORY || !!s.project_id || !!s.house_area;

/** What each area added this month, in the budget's currency. Amounts that cannot be converted are left out. */
export function spentByArea(inp: MonthInputs, currency: BudgetCurrency): Record<SpentArea, number> {
  const out: Record<SpentArea, number> = { groceries: 0, utilities: 0, quick: 0, house: 0, savings: 0 };
  const add = (k: SpentArea, v: number | null) => { if (v != null && Number.isFinite(v)) out[k] += v; };
  for (const g of inp.groceries) add("groceries", convert(Number(g.total), g.currency, currency));
  for (const u of inp.utilities) add("utilities", convert(Number(u.amount_usd) || 0, "USD", currency));
  for (const s of inp.spends) add(isHouseSpend(s) ? "house" : "quick", convert(Number(s.amount), s.currency, currency, s.amount_usd == null ? null : Number(s.amount_usd)));
  for (const p of inp.projects) add("house", convert(Number(p.amount_usd) || 0, "USD", currency));
  for (const x of inp.savings ?? []) add("savings", convert(Number(x.amount), x.currency, currency));
  for (const k of Object.keys(out) as SpentArea[]) out[k] = round2(out[k]);
  return out;
}

export function budgetState(spent: number, budget: number): BudgetState {
  if (budget <= 0) return "ok";
  if (spent > budget) return "over";
  return spent >= budget * NEAR_AT ? "near" : "ok";
}

export type BudgetView = {
  budget: number; currency: BudgetCurrency; spent: number; left: number; over: number;
  state: BudgetState; byArea: Record<SpentArea, number>; limits: Limits;
  /** days still to go in the month, today included; 0 after the last day */
  daysLeft: number; daysInMonth: number;
  /** how much a day you can still spend; null when nothing is left or the month is over */
  perDay: number | null;
  /** how far through the month we are, 0..1 */
  pace: number;
};

export function daysInMonthOf(today: string): number {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function budgetView(setting: BudgetSetting, byArea: Record<SpentArea, number>, today: string): BudgetView {
  const spent = round2(BUDGET_AREAS.reduce((t, a) => t + byArea[a.key], 0) + (byArea.savings ?? 0));
  const dim = daysInMonthOf(today), day = Number(today.slice(8, 10));
  const daysLeft = dim - day + 1;
  const left = round2(Math.max(0, setting.amount - spent));
  return {
    budget: setting.amount, currency: setting.currency, spent, left, over: round2(Math.max(0, spent - setting.amount)),
    state: budgetState(spent, setting.amount), byArea, limits: setting.limits, daysLeft, daysInMonth: dim,
    perDay: left > 0 && daysLeft > 0 ? Math.round(left / daysLeft) : null,
    pace: Math.min(1, Math.max(0, (day - 1) / dim)),
  };
}

/** Parses what is typed into a budget box: a comma or a dot, nothing for "no limit". */
export function parseBudgetInput(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? round2(n) : null;
}
