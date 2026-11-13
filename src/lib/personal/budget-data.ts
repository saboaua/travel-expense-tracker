import type { SupabaseClient } from "@supabase/supabase-js";
import { BUDGET_COLS, SAVINGS_EVENT_COLS, SAVINGS_PLAN_COLS, SAVINGS_PLAN_COLS_BASE, withColumnFallback, withColumnFallback3 } from "@/lib/columns";
import { onlySpending } from "@/lib/personal/price-notes";
import { monthSavings, readEvent, readPlan } from "@/lib/personal/savings";
import { readBudget, type BudgetSetting, type MonthInputs } from "@/lib/personal/budget";

const monthEnd = (monthStart: string) => {
  const y = Number(monthStart.slice(0, 4)), m = Number(monthStart.slice(5, 7));
  return `${monthStart.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** Your saved budgets. `missing` is true when the migration has not been run yet. */
export async function fetchBudgets(supabase: SupabaseClient): Promise<{ rows: BudgetSetting[]; missing: boolean }> {
  const { data, error } = await supabase.from("personal_budgets").select(BUDGET_COLS).limit(100);
  if (error) return { rows: [], missing: /relation|schema cache|does not exist/i.test(error.message ?? "") };
  return { rows: ((data ?? []) as unknown as Parameters<typeof readBudget>[0][]).map(readBudget), missing: false };
}

/** What you recorded in one month (monthStart is YYYY-MM-01). Any part that cannot be read counts as nothing. */
export async function fetchMonthInputs(supabase: SupabaseClient, monthStart: string, userId?: string): Promise<MonthInputs> {
  const end = monthEnd(monthStart);
  const mine = <T,>(q: T): T => (userId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("user_id", userId) : q);
  const [g, u, ud, s, pr] = await Promise.all([
    withColumnFallback((cols) => mine(supabase.from("grocery_receipts").select(cols).gte("purchase_date", monthStart).lte("purchase_date", end).limit(2000)), "total, currency, prices_only", "total, currency").then((r) => onlySpending<{ total: number; currency: string }>(r)),
    // utilities count in the month they were PAID; bills not paid yet are only reported as "still due"
    mine(supabase.from("utility_bills").select("amount_usd").gte("paid_on", monthStart).lte("paid_on", end).limit(200)),
    mine(supabase.from("utility_bills").select("amount_usd").is("paid_on", null).limit(200)),
    withColumnFallback3((cols) => mine(supabase.from("personal_spends").select(cols).gte("expense_date", monthStart).lte("expense_date", end).limit(2000)), "amount, currency, amount_usd, category, project_id, house_area", "amount, currency, amount_usd, category, project_id", "amount, currency, amount_usd, category"),
    mine(supabase.from("personal_projects").select("id").eq("kind", "home_project").limit(500)),
  ]);
  const homeIds = new Set(((pr.data ?? []) as { id: string }[]).map((p) => p.id));
  let projects: MonthInputs["projects"] = [];
  if (homeIds.size) {
    const e = await mine(supabase.from("personal_expenses").select("project_id, amount_usd").gte("expense_date", monthStart).lte("expense_date", end).limit(2000));
    projects = ((e.data ?? []) as { project_id: string; amount_usd: number | string | null }[]).filter((x) => homeIds.has(x.project_id));
  }
  // savings plans: what they put aside this month (nothing when the tables are missing)
  const [pl, ev] = await Promise.all([
    withColumnFallback((cols) => mine(supabase.from("savings_plans").select(cols).limit(100)), SAVINGS_PLAN_COLS, SAVINGS_PLAN_COLS_BASE),
    mine(supabase.from("savings_events").select(SAVINGS_EVENT_COLS).limit(1000)),
  ]);
  const savings = pl.error || ev.error ? [] : monthSavings(((pl.data ?? []) as unknown as Parameters<typeof readPlan>[0][]).map(readPlan), ((ev.data ?? []) as unknown as Parameters<typeof readEvent>[0][]).map(readEvent), monthStart);
  return {
    savings,
    groceries: g.error ? [] : (g.data ?? []),
    utilities: u.error ? [] : ((u.data ?? []) as MonthInputs["utilities"]),
    utilitiesDue: ud.error ? [] : ((ud.data ?? []) as MonthInputs["utilities"]),
    spends: s.error ? [] : ((s.data ?? []) as unknown as MonthInputs["spends"]),
    projects,
  };
}
