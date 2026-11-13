import { convert, dominantCurrency, round2, type BudgetCurrency } from "@/lib/personal/money";

type GroceryRow = { total: number | string; currency: string };
type ProjectRow = { kind: string; status?: string; personal_expenses?: { amount_usd: number | string | null }[] | null };

export type PersonalSummary = {
  /** This month's receipts in the most-used currency (null when there are none). */
  grocery: { total: number; currency: string; count: number } | null;
  projects: { count: number; spent: number; currency: string };
  trips: { count: number; spent: number; currency: string };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Totals shown on the Personal page and the dashboard tiles. Pass only active projects. */
export function summarizePersonal(groceries: GroceryRow[] | null | undefined, projects: ProjectRow[] | null | undefined, show?: BudgetCurrency): PersonalSummary {
  let grocery: PersonalSummary["grocery"] = null;
  if (groceries && groceries.length) {
    const currency = show ?? dominantCurrency(groceries);
    let total = 0;
    for (const r of groceries) total += convert(num(r.total), r.currency, currency) ?? 0;
    grocery = { currency, total: round2(total), count: groceries.length };
  }
  // Project and trip spending is stored in USD; show it in the same currency as everything else
  const sum = (kind: string) => {
    const rows = (projects || []).filter((r) => r.kind === kind);
    const usd = rows.reduce((s, r) => s + (r.personal_expenses || []).reduce((a, e) => a + num(e.amount_usd), 0), 0);
    return { count: rows.length, spent: round2(convert(usd, "USD", show ?? "USD") ?? usd), currency: show ?? "USD" };
  };
  return { grocery, projects: sum("home_project"), trips: sum("personal_trip") };
}
