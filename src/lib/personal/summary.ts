export type GroceryRow = { total: number | string; currency: string };
export type ProjectRow = { kind: string; status?: string; personal_expenses?: { amount_usd: number | string | null }[] | null };

export type PersonalSummary = {
  /** This month's receipts in the most-used currency (null when there are none). */
  grocery: { total: number; currency: string; count: number } | null;
  projects: { count: number; spent: number };
  trips: { count: number; spent: number };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Totals shown on the Personal page and the dashboard tiles. Pass only active projects. */
export function summarizePersonal(groceries: GroceryRow[] | null | undefined, projects: ProjectRow[] | null | undefined): PersonalSummary {
  let grocery: PersonalSummary["grocery"] = null;
  if (groceries && groceries.length) {
    const by = new Map<string, { total: number; count: number }>();
    for (const r of groceries) {
      const cur = by.get(r.currency) || { total: 0, count: 0 };
      by.set(r.currency, { total: cur.total + num(r.total), count: cur.count + 1 });
    }
    const [currency, v] = [...by.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    grocery = { currency, total: Math.round(v.total * 100) / 100, count: v.count };
  }
  const sum = (kind: string) => {
    const rows = (projects || []).filter((r) => r.kind === kind);
    const spent = rows.reduce((s, r) => s + (r.personal_expenses || []).reduce((a, e) => a + num(e.amount_usd), 0), 0);
    return { count: rows.length, spent: Math.round(spent * 100) / 100 };
  };
  return { grocery, projects: sum("home_project"), trips: sum("personal_trip") };
}
