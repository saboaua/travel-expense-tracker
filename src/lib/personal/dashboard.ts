/**
 * Numbers for the Personal dashboard. Pure functions, so they can be tested without a database.
 *
 * Base currency is the Aruban florin (AWG), because groceries and home projects are paid in it. Everything else is
 * converted through US dollars: AWG is pegged at 1 USD = 1.79 AWG.
 *
 * Only the signed-in person's own rows are ever passed in (the page reads them under row-level security).
 */
import { addDaysISO, daysBetween } from "@/lib/utils";

export const BASE_CURRENCY = "AWG";
/** AWG per 1 USD (official peg). */
export const AWG_PER_USD = 1.79;

export type DashboardRow = {
  source: "expense" | "grocery";
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  category: string;
  /** personal_projects id, or null for groceries */
  projectId: string | null;
  currency: string;
  /** Amount in the currency it was paid in */
  original: number;
  /** Same amount in AWG, or null when no rate is known */
  awg: number | null;
};

export type DashboardProject = { id: string; name: string; kind: string; status?: string; destination?: string | null; start_date: string | null; end_date: string | null };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Converts to AWG. `amountUsd` (frozen on the expense when it was saved) wins; otherwise the currency's USD rate.
 * Returns null when there is no way to convert, so the row is counted separately instead of silently as zero.
 */
export function toAwg(amount: number, currency: string, amountUsd: number | null | undefined, usdRates: Record<string, number>): number | null {
  const code = (currency || "").toUpperCase();
  if (code === BASE_CURRENCY) return round2(amount);
  if (amountUsd != null && Number.isFinite(Number(amountUsd)) && (Number(amountUsd) > 0 || amount === 0)) return round2(Number(amountUsd) * AWG_PER_USD);
  if (code === "USD") return round2(amount * AWG_PER_USD);
  const rate = usdRates[code];
  if (rate && rate > 0) return round2(amount * rate * AWG_PER_USD);
  return null;
}

type ExpenseRow = { project_id: string; merchant: string | null; amount: number | string; currency: string; amount_usd: number | string | null; category: string | null; expense_date: string };
type GroceryRow = { store: string; purchase_date: string; total: number | string; currency: string };

export function buildRows(expenses: ExpenseRow[] | null | undefined, groceries: GroceryRow[] | null | undefined, usdRates: Record<string, number>): DashboardRow[] {
  const out: DashboardRow[] = [];
  for (const e of expenses || []) {
    const original = num(e.amount);
    out.push({
      source: "expense",
      date: e.expense_date,
      merchant: (e.merchant || "").trim() || "Unknown",
      category: (e.category || "").trim() || "Other",
      projectId: e.project_id,
      currency: (e.currency || "USD").toUpperCase(),
      original,
      awg: toAwg(original, e.currency || "USD", e.amount_usd == null ? null : num(e.amount_usd), usdRates),
    });
  }
  for (const g of groceries || []) {
    const original = num(g.total);
    out.push({
      source: "grocery",
      date: g.purchase_date,
      merchant: (g.store || "").trim() || "Unknown",
      category: "Groceries",
      projectId: null,
      currency: (g.currency || "AWG").toUpperCase(),
      original,
      awg: toAwg(original, g.currency || "AWG", null, usdRates),
    });
  }
  return out;
}

/* ---------------- filters ---------------- */

export type RangePreset = "30d" | "90d" | "year" | "all" | "custom";
export type DashboardFilter = { range: RangePreset; from: string; to: string; store: string; project: string; /** Tapping a category on the dashboard filters the page by it */ category: string };

export const DEFAULT_FILTER: DashboardFilter = { range: "30d", from: "", to: "", store: "", project: "", category: "" };

export function resolveRange(f: Pick<DashboardFilter, "range" | "from" | "to">, today: string): { from: string; to: string } {
  switch (f.range) {
    case "30d": return { from: addDaysISO(today, -29), to: today };
    case "90d": return { from: addDaysISO(today, -89), to: today };
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all": return { from: "0000-01-01", to: "9999-12-31" };
    case "custom": {
      const a = /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? f.from : "0000-01-01";
      const b = /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? f.to : "9999-12-31";
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }
  }
}

export function filterRows(rows: DashboardRow[], f: DashboardFilter, today: string): DashboardRow[] {
  const { from, to } = resolveRange(f, today);
  return rows.filter((r) => r.date >= from && r.date <= to && (!f.store || r.merchant === f.store) && (!f.project || r.projectId === f.project) && (!f.category || r.category === f.category));
}

/**
 * The stretch of the same length that ends the day before the current range starts, with the same store / project /
 * category filters. Null for "All time" (nothing to compare with) or when that earlier stretch has no spending.
 */
export function previousPeriod(rows: DashboardRow[], f: DashboardFilter, today: string): { from: string; to: string; days: number; total: number } | null {
  if (f.range === "all") return null;
  const r = resolveRange(f, today);
  if (r.from < "0001-01-01") return null;
  const end = r.to > today ? today : r.to;
  const days = daysBetween(r.from, end) + 1;
  if (days < 1) return null;
  const to = addDaysISO(r.from, -1);
  const from = addDaysISO(to, -(days - 1));
  const total = round2(filterRows(rows, { ...f, range: "custom", from, to }, today).reduce((s, x) => s + (x.awg ?? 0), 0));
  return total > 0 ? { from, to, days, total } : null;
}

/** Whole-number change against the earlier period; positive means more spending. Null when there is nothing to compare. */
export function changePercent(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** The day with the most spending in the rows, or null when there is none. */
export function busiestDay(rows: DashboardRow[]): { date: string; value: number } | null {
  const m = new Map<string, number>();
  for (const r of rows) if (r.awg != null) m.set(r.date, (m.get(r.date) || 0) + r.awg);
  let best: { date: string; value: number } | null = null;
  for (const [date, v] of m) if (!best || v > best.value) best = { date, value: round2(v) };
  return best;
}

/* ---------------- analytics ---------------- */

export type Grain = "day" | "week" | "month";
export type Slice = { label: string; value: number };

export type Analytics = {
  total: number;
  count: number;
  /** Rows that could not be converted to AWG (no known rate) */
  unconverted: number;
  days: number;
  avgPerDay: number;
  byCategory: Slice[];
  topMerchants: (Slice & { visits: number })[];
  byCurrency: { currency: string; original: number; awg: number | null }[];
  perProject: { id: string; name: string; days: number; total: number; perDay: number }[];
  stores: string[];
};

/** Monday of the week containing `date`. */
function weekStart(date: string) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysISO(date, -dow);
}

export function trendSeries(rows: DashboardRow[], grain: Grain, range: { from: string; to: string }, today: string): { key: string; value: number }[] {
  const keyOf = (d: string) => (grain === "day" ? d : grain === "week" ? weekStart(d) : `${d.slice(0, 7)}-01`);
  const sums = new Map<string, number>();
  for (const r of rows) if (r.awg != null) sums.set(keyOf(r.date), (sums.get(keyOf(r.date)) || 0) + r.awg);
  if (sums.size === 0) return [];
  const dates = [...sums.keys()].sort();
  // Fill gaps so quiet days show as zero. "All time" has no bounds, so start at the first purchase.
  const start = keyOf(range.from > "0001-01-01" ? range.from : dates[0]);
  const endRaw = range.to < "9999-01-01" ? range.to : today;
  const end = keyOf(endRaw < dates[dates.length - 1] ? dates[dates.length - 1] : endRaw);
  const out: { key: string; value: number }[] = [];
  let cur = start;
  for (let i = 0; i < 4000 && cur <= end; i++) {
    out.push({ key: cur, value: round2(sums.get(cur) || 0) });
    if (grain === "day") cur = addDaysISO(cur, 1);
    else if (grain === "week") cur = addDaysISO(cur, 7);
    else {
      const d = new Date(`${cur}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      cur = d.toISOString().slice(0, 10);
    }
  }
  return out;
}

export function analyze(allRows: DashboardRow[], filtered: DashboardRow[], projects: DashboardProject[], f: DashboardFilter, today: string): Analytics {
  const range = resolveRange(f, today);
  const converted = filtered.filter((r) => r.awg != null);
  const total = round2(converted.reduce((s, r) => s + (r.awg as number), 0));

  const dates = filtered.map((r) => r.date).sort();
  let days: number;
  if (f.range === "all" || range.from < "0001-01-01") days = dates.length ? Math.max(1, daysBetween(dates[0], today > dates[dates.length - 1] ? today : dates[dates.length - 1]) + 1) : 1;
  else days = Math.max(1, daysBetween(range.from, range.to > today ? today : range.to) + 1);

  const group = (keyOf: (r: DashboardRow) => string) => {
    const m = new Map<string, { value: number; visits: number }>();
    for (const r of converted) {
      const k = keyOf(r);
      const cur = m.get(k) || { value: 0, visits: 0 };
      m.set(k, { value: cur.value + (r.awg as number), visits: cur.visits + 1 });
    }
    return [...m.entries()].map(([label, v]) => ({ label, value: round2(v.value), visits: v.visits })).sort((a, b) => b.value - a.value);
  };

  const byCategory = group((r) => r.category).map(({ label, value }) => ({ label, value }));
  const topMerchants = group((r) => r.merchant).slice(0, 5);

  const cur = new Map<string, { original: number; awg: number | null }>();
  for (const r of filtered) {
    const c = cur.get(r.currency) || { original: 0, awg: 0 };
    c.original += r.original;
    c.awg = c.awg == null || r.awg == null ? null : c.awg + r.awg;
    cur.set(r.currency, c);
  }
  const byCurrency = [...cur.entries()]
    .map(([currency, v]) => ({ currency, original: round2(v.original), awg: v.awg == null ? null : round2(v.awg) }))
    .sort((a, b) => (b.awg ?? -1) - (a.awg ?? -1));

  const perProject = projects
    .map((p) => {
      const mine = converted.filter((r) => r.projectId === p.id);
      if (mine.length === 0) return null;
      const t = round2(mine.reduce((s, r) => s + (r.awg as number), 0));
      let d: number;
      const pStart = p.start_date;
      if (pStart) {
        const from = pStart > range.from ? pStart : range.from;
        const endCap = p.end_date && p.end_date < today ? p.end_date : today;
        const to = endCap < range.to ? endCap : range.to;
        d = to >= from ? daysBetween(from, to) + 1 : 0;
      } else d = 0;
      if (d < 1) d = new Set(mine.map((r) => r.date)).size; // no usable dates on the project: count the days that had spending
      return { id: p.id, name: p.name, days: d, total: t, perDay: round2(t / d) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.total - a.total);

  const stores = [...new Set(allRows.map((r) => r.merchant))].sort((a, b) => a.localeCompare(b));

  return {
    total,
    count: filtered.length,
    unconverted: filtered.length - converted.length,
    days,
    avgPerDay: round2(total / days),
    byCategory,
    topMerchants,
    byCurrency,
    perProject,
    stores,
  };
}

/** Tiles at the top of the Personal view: groceries this month, and active home projects / personal trips. All in AWG. */
export function tileSummary(rows: DashboardRow[], projects: DashboardProject[], today: string) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const groc = rows.filter((r) => r.source === "grocery" && r.date >= monthStart && r.awg != null);
  const spent = (kind: string) => {
    const active = projects.filter((p) => p.kind === kind && (p.status || "active") === "active");
    const ids = new Set(active.map((p) => p.id));
    const t = rows.filter((r) => r.projectId && ids.has(r.projectId) && r.awg != null).reduce((s, r) => s + (r.awg as number), 0);
    return { count: active.length, spent: round2(t) };
  };
  return {
    grocery: groc.length ? { total: round2(groc.reduce((s, r) => s + (r.awg as number), 0)), currency: BASE_CURRENCY, count: groc.length } : null,
    projects: spent("home_project"),
    trips: spent("personal_trip"),
  };
}
