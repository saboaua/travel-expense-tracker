/** Quick spend: purchases with no receipt. Personal only; a business expense still needs a receipt or invoice. */

export const QUICK_CATEGORIES = ["Coffee & snacks", "Street food", "Transport", "Personal care", "House", "Other"] as const;
export const QUICK_DEFAULT_CURRENCY = "AWG";

export type SpendRow = { id: string; merchant: string | null; amount: number | string; currency: string; amount_usd?: number | string | null; category: string; expense_date: string };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** This month's quick spends in the most-used currency (null when there are none). */
export function summarizeSpends(rows: { amount: number | string; currency: string }[] | null | undefined): { total: number; currency: string; count: number } | null {
  if (!rows?.length) return null;
  const by = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const cur = by.get(r.currency) || { total: 0, count: 0 };
    by.set(r.currency, { total: cur.total + num(r.amount), count: cur.count + 1 });
  }
  const [currency, v] = [...by.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return { currency, total: r2(v.total), count: v.count };
}

/** The names you use most, newest-first on ties, with the category and currency you used last, for one-tap chips. */
export function recentNames(rows: SpendRow[], limit = 4): { name: string; category: string; amount: number; currency: string }[] {
  const by = new Map<string, { name: string; count: number; last: SpendRow }>();
  for (const r of rows) {
    const name = (r.merchant ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = by.get(key);
    if (!cur) by.set(key, { name, count: 1, last: r });
    else { cur.count++; if (r.expense_date > cur.last.expense_date) cur.last = r; }
  }
  return [...by.values()]
    .sort((a, b) => b.count - a.count || b.last.expense_date.localeCompare(a.last.expense_date))
    .slice(0, limit)
    .map((x) => ({ name: x.name, category: x.last.category, amount: num(x.last.amount), currency: x.last.currency }));
}

/** "4.5", "4,50" -> 4.5; empty or negative -> null. */
export function parseAmount(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? r2(n) : null;
}
