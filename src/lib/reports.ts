/** Pure report analytics (no I/O) so the numbers are unit-testable. All money is USD. */

export type ExpenseRow = {
  amount: number | string;
  amount_usd?: number | string | null;
  currency?: string | null;
  category: string | null;
  expense_date: string;
  merchant?: string | null;
  trip_id?: string | null;
};

/** USD value of an expense, or null when none is known (foreign currency saved without a USD amount). */
export function usdOf(e: ExpenseRow): number | null {
  if (e.amount_usd != null) return Number(e.amount_usd);
  if (!e.currency || e.currency === "USD") return Number(e.amount);
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

export type CategorySlice = { category: string; total: number; pct: number };

/** Top `max` categories by spend with the rest merged into "Other"; pct is the share of `total`. */
export function categorySlices(cats: Map<string, number>, total: number, max = 6): CategorySlice[] {
  let slices = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([category, t]) => ({ category, total: t }));
  if (slices.length > max) {
    const head = slices.slice(0, max - 1);
    const rest = slices.slice(max - 1).reduce((sum, x) => sum + x.total, 0);
    const existingOther = head.find((x) => x.category === "Other");
    if (existingOther) existingOther.total += rest;
    else head.push({ category: "Other", total: rest });
    slices = head.sort((a, b) => b.total - a.total);
  }
  return slices.map((s) => ({ category: s.category, total: r2(s.total), pct: total > 0 ? Math.round((s.total / total) * 1000) / 10 : 0 }));
}

export type YearSummary = {
  year: number;
  total: number;
  prevYearTotal: number;
  yearChangePct: number | null;
  expenseCount: number;
  missingUsd: number;
  monthly: number[]; // 12 values, Jan..Dec
  focusMonthIndex: number; // current month for the current year, otherwise the peak month
  focusMonthTotal: number;
  focusMonthChangePct: number | null; // vs the month before the focus month
  avgPerActiveMonth: number;
  categories: CategorySlice[];
  merchants: { name: string; total: number; count: number }[];
  tripTotals: Record<string, { total: number; count: number }>;
};

/**
 * @param rows expenses dated in `year` and the year before
 * @param currentMonthKey "YYYY-MM" of today (decides the focus month for the current year)
 */
export function summarize(rows: ExpenseRow[], year: number, currentMonthKey: string, maxSlices = 6): YearSummary {
  const key = String(year);
  const monthAll = new Map<string, number>(); // "YYYY-MM" -> total (both years, for month-over-month across New Year)
  const monthly = Array(12).fill(0) as number[];
  const cats = new Map<string, number>();
  const merchants = new Map<string, { name: string; total: number; count: number }>();
  const tripTotals: YearSummary["tripTotals"] = {};
  let total = 0;
  let prevYearTotal = 0;
  let expenseCount = 0;
  let missingUsd = 0;

  for (const e of rows) {
    const usd = usdOf(e);
    const ym = (e.expense_date || "").slice(0, 7);
    if (usd != null && ym) monthAll.set(ym, (monthAll.get(ym) || 0) + usd);

    if (!e.expense_date) continue;
    const y = e.expense_date.slice(0, 4);
    if (y === String(year - 1)) {
      if (usd != null) prevYearTotal += usd;
      continue;
    }
    if (y !== key) continue;

    expenseCount++;
    if (usd == null) {
      missingUsd++;
      continue;
    }
    total += usd;
    monthly[Number(ym.slice(5, 7)) - 1] += usd;
    const cat = (e.category || "Other").trim() || "Other";
    cats.set(cat, (cats.get(cat) || 0) + usd);

    const m = (e.merchant || "").trim();
    if (m) {
      const mk = m.toLowerCase();
      const cur = merchants.get(mk) || { name: m, total: 0, count: 0 };
      cur.total += usd;
      cur.count += 1;
      merchants.set(mk, cur);
    }
    if (e.trip_id) {
      const t = tripTotals[e.trip_id] || { total: 0, count: 0 };
      t.total += usd;
      t.count += 1;
      tripTotals[e.trip_id] = t;
    }
  }

  const categories = categorySlices(cats, total, maxSlices);

  // Focus month: this month for the current year, otherwise the biggest month
  let focus = monthly.indexOf(Math.max(...monthly));
  if (currentMonthKey.startsWith(key)) focus = Number(currentMonthKey.slice(5, 7)) - 1;
  if (focus < 0) focus = 0;
  const prevKey = focus === 0 ? `${year - 1}-12` : `${key}-${String(focus).padStart(2, "0")}`;
  const focusTotal = monthly[focus];
  const activeMonths = monthly.filter((v) => v > 0).length;

  return {
    year,
    total: r2(total),
    prevYearTotal: r2(prevYearTotal),
    yearChangePct: prevYearTotal > 0 ? pctChange(total, prevYearTotal) : null,
    expenseCount,
    missingUsd,
    monthly: monthly.map(r2),
    focusMonthIndex: focus,
    focusMonthTotal: r2(focusTotal),
    focusMonthChangePct: monthAll.has(prevKey) ? pctChange(focusTotal, monthAll.get(prevKey) || 0) : null,
    avgPerActiveMonth: activeMonths ? r2(total / activeMonths) : 0,
    categories,
    merchants: [...merchants.values()].map((m) => ({ ...m, total: r2(m.total) })).sort((a, b) => b.total - a.total).slice(0, 5),
    tripTotals: Object.fromEntries(Object.entries(tripTotals).map(([k, v]) => [k, { total: r2(v.total), count: v.count }])),
  };
}

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
