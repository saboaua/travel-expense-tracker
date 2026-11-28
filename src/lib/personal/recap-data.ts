import type { SupabaseClient } from "@supabase/supabase-js";
import { BUDGET_COLS } from "@/lib/columns";
import { budgetView, pickBudget, readBudget, spentByArea, spentByTypeId, type BudgetSetting } from "@/lib/personal/budget";
import { fetchBudgets, fetchMonthInputs } from "@/lib/personal/budget-data";
import { fetchMonthRaw, monthReport } from "@/lib/personal/month-report";
import { buildProducts } from "@/lib/personal/price-compare";
import { fetchPriceMatches, fetchPrices } from "@/lib/offline-grocery";
import type { BudgetCurrency } from "@/lib/personal/money";
import { buildRecap, couldHaveSaved, monthEnd, previousMonth, recapState, totalOf, type Recap, type RecapState, type Saving } from "@/lib/personal/recap";

/** What the month's spending came to, the same way the budget card counts it, and the budget that applied. */
async function monthSpent(db: SupabaseClient, uid: string, month: string, setting: BudgetSetting | null): Promise<{ spent: number; currency: BudgetCurrency }> {
  const currency: BudgetCurrency = setting?.currency ?? "AWG";
  const inputs = await fetchMonthInputs(db, month, uid);
  const byArea = spentByArea(inputs, currency);
  const spent = setting ? budgetView(setting, byArea, month, 0, spentByTypeId(inputs, currency)).spent : totalOf(byArea);
  return { spent, currency };
}

/** The recap of one finished month, for the card and the full page. Read under the person's own sign-in. `recap` is null when nothing was spent. */
export async function fetchRecap(sb: SupabaseClient, uid: string, month: string): Promise<{ data: { recap: Recap | null } | null; error: unknown }> {
  try {
    const budgets = await fetchBudgets(sb);
    const setting = pickBudget(budgets.rows, month);
    const before = previousMonth(month);
    const [{ spent, currency }, raw, rawBefore] = await Promise.all([monthSpent(sb, uid, month, setting), fetchMonthRaw(sb, month, uid), fetchMonthRaw(sb, before, uid)]);
    const now = monthReport(raw, currency, month);
    const last = monthReport(rawBefore, currency, before);
    // A price seen after the month is not one the person could have used then
    let saving: Saving | null = null;
    try {
      const [rows, decisions] = await Promise.all([fetchPrices(sb), fetchPriceMatches(sb)]);
      const until = monthEnd(month);
      const { products } = buildProducts((rows.data ?? []).filter((r) => r.receipt.purchase_date <= until), decisions.data ?? []);
      saving = couldHaveSaved(products, month, currency);
    } catch { /* without prices there is just no saving line */ }
    return { data: { recap: buildRecap({ month, currency, spent, budget: setting ? setting.amount : null, areas: now.byArea, lastAreas: last.byArea, saving }) }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/** Under or over budget for one person's finished month, for the phone message (no amounts). Null when nothing was spent. Needs a service client. */
export async function fetchRecapState(db: SupabaseClient, uid: string, month: string): Promise<{ state: RecapState; spent: number } | null> {
  const res = await db.from("personal_budgets").select(BUDGET_COLS).eq("user_id", uid).limit(100);
  const rows = res.error ? [] : ((res.data ?? []) as unknown as Parameters<typeof readBudget>[0][]).map(readBudget);
  const setting = pickBudget(rows, month);
  const { spent } = await monthSpent(db, uid, month, setting);
  if (!(spent > 0)) return null;
  return { state: recapState(spent, setting ? setting.amount : null), spent };
}
