import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_BASE, PERSONAL_SPEND_COLS_MID, withColumnFallback3 } from "@/lib/columns";
import { isHouseSpend, round2, type SpentArea } from "@/lib/personal/budget";
import { fetchMonthInputs } from "@/lib/personal/budget-data";
import { fetchShoppingList } from "@/lib/personal/item-rules";
import { CATEGORY_LABEL, KIND_LABEL, type FixedLine } from "@/lib/personal/fixed-costs";
import { convert, type BudgetCurrency } from "@/lib/personal/money";
import { kindLabel } from "@/lib/personal/utilities";

/** Every expense of one month, one line each, counted by the same rules as "Where it goes" and the budget. */

export type MonthRaw = {
  receipts: { id: string; store: string | null; purchase_date: string; total: number | string; currency: string; area?: string | null; type_name?: string | null }[];
  /** receipt lines in a shopping category: they count under Shopping and come out of that receipt's Groceries */
  shopItems: { receipt_id: string; name: string; category: string | null; line_total: number | string; purchase_date: string; store: string | null; currency: string }[];
  utilities: { kind: string; provider: string | null; paid_on: string; amount_usd: number | string | null }[];
  spends: { merchant: string | null; category: string; expense_date: string; amount: number | string; currency: string; amount_usd?: number | string | null; project_id?: string | null; house_area?: string | null }[];
  /** fill-ups of the car (optional: older callers have none) */
  fuel?: { fill_date: string; station: string | null; amount: number | string; currency: string; amount_usd?: number | string | null }[];
  projectExpenses: { merchant: string | null; category: string | null; expense_date: string; amount_usd: number | string | null; project_name: string }[];
  savings: { amount: number; currency: string }[];
  fixed: FixedLine[];
};

export type MonthLine = { date: string; area: string; name: string; category: string; amount: number };

export const AREA_NAME: Record<SpentArea | "loans" | "insurances" | "cards" | "gambling", string> = {
  groceries: "Groceries", shopping: "Shopping", utilities: "Utilities", quick: "Quick spend", fuel: "Fuel", house: "House & repairs", savings: "Savings",
  loans: CATEGORY_LABEL.loans, insurances: CATEGORY_LABEL.insurances, cards: CATEGORY_LABEL.cards, gambling: CATEGORY_LABEL.gambling,
};

export function monthReport(raw: MonthRaw, currency: BudgetCurrency, month: string): { lines: MonthLine[]; byArea: [string, number][]; total: number; uncounted: number } {
  const lines: MonthLine[] = [];
  let uncounted = 0;
  const add = (area: keyof typeof AREA_NAME, date: string, name: string, category: string, v: number | null) => {
    if (v == null || !Number.isFinite(v)) { uncounted++; return; }
    lines.push({ date, area: AREA_NAME[area], name, category, amount: round2(v) });
  };
  const shopByReceipt = new Map<string, number>();
  for (const x of raw.shopItems) {
    const v = convert(Number(x.line_total), x.currency, currency);
    if (v == null) continue;
    shopByReceipt.set(x.receipt_id, (shopByReceipt.get(x.receipt_id) ?? 0) + v);
    add("shopping", x.purchase_date, x.name, x.category || "Shopping", v);
  }
  for (const r of raw.receipts) {
    const t = convert(Number(r.total), r.currency, currency);
    if (r.area === "other" && r.type_name) {
      // a receipt of one of your own types counts under that type's name
      if (t == null) uncounted++; else lines.push({ date: r.purchase_date, area: r.type_name, name: r.store || `${r.type_name} receipt`, category: r.type_name, amount: round2(t) });
      continue;
    }
    add("groceries", r.purchase_date, r.store || "Grocery receipt", "Groceries", t == null ? null : t - (shopByReceipt.get(r.id) ?? 0));
  }
  for (const u of raw.utilities) add("utilities", u.paid_on, [kindLabel(u.kind), u.provider].filter(Boolean).join(" - "), "Utilities", convert(Number(u.amount_usd) || 0, "USD", currency));
  for (const s of raw.spends) add(isHouseSpend(s) ? "house" : "quick", s.expense_date, s.merchant || s.category, s.category, convert(Number(s.amount), s.currency, currency, s.amount_usd == null ? null : Number(s.amount_usd)));
  for (const f of raw.fuel ?? []) add("fuel", f.fill_date, f.station || "Fuel fill-up", "Fuel", convert(Number(f.amount), f.currency, currency, f.amount_usd == null ? null : Number(f.amount_usd)));
  for (const p of raw.projectExpenses) add("house", p.expense_date, p.merchant || p.project_name, p.project_name, convert(Number(p.amount_usd) || 0, "USD", currency));
  for (const s of raw.savings) add("savings", month, "Savings plan", "Savings", convert(Number(s.amount), s.currency, currency));
  for (const f of raw.fixed) add(f.category, month, KIND_LABEL[f.kind], CATEGORY_LABEL[f.category], convert(f.amount, f.currency, currency));
  // groceries a receipt had only in shopping lines leave a zero line behind; drop those
  const kept = lines.filter((l) => !(l.area === AREA_NAME.groceries && Math.abs(l.amount) < 0.005));
  kept.sort((a, b) => a.date.localeCompare(b.date) || a.area.localeCompare(b.area));
  const by = new Map<string, number>();
  for (const l of kept) by.set(l.area, (by.get(l.area) ?? 0) + l.amount);
  const byArea = [...by.entries()].map(([k, v]) => [k, round2(v)] as [string, number]).sort((a, b) => b[1] - a[1]);
  return { lines: kept, byArea, total: round2(byArea.reduce((t, [, v]) => t + v, 0)), uncounted };
}

const monthEnd = (monthStart: string) => {
  const y = Number(monthStart.slice(0, 4)), m = Number(monthStart.slice(5, 7));
  return `${monthStart.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** What the month holds, line by line. Any part that cannot be read counts as nothing. */
export async function fetchMonthRaw(supabase: SupabaseClient, monthStart: string, userId: string): Promise<MonthRaw> {
  const end = monthEnd(monthStart);
  const inputs = await fetchMonthInputs(supabase, monthStart, userId);
  const shopNames = await fetchShoppingList(supabase);
  const [rc, ut, sp, pr, fu] = await Promise.all([
    withColumnFallback3((cols) => supabase.from("grocery_receipts").select(cols).eq("user_id", userId).gte("purchase_date", monthStart).lte("purchase_date", end).limit(2000), "id, store, purchase_date, total, currency, prices_only, area, type_id", "id, store, purchase_date, total, currency, prices_only", "id, store, purchase_date, total, currency"),
    supabase.from("utility_bills").select("kind, provider, paid_on, amount_usd").eq("user_id", userId).gte("paid_on", monthStart).lte("paid_on", end).limit(500),
    withColumnFallback3((cols) => supabase.from("personal_spends").select(cols).eq("user_id", userId).gte("expense_date", monthStart).lte("expense_date", end).limit(2000), PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_MID, PERSONAL_SPEND_COLS_BASE),
    supabase.from("personal_projects").select("id, name").eq("user_id", userId).eq("kind", "home_project").limit(500),
    supabase.from("fuel_fillups").select("fill_date, station, amount, currency, amount_usd").eq("user_id", userId).gte("fill_date", monthStart).lte("fill_date", end).limit(500),
  ]);
  const typeRows = await supabase.from("receipt_types").select("id, name").eq("user_id", userId).limit(100);
  const typeNames = new Map(typeRows.error ? [] : ((typeRows.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name] as const));
  const receipts = ((rc.data ?? []) as unknown as (MonthRaw["receipts"][number] & { prices_only?: boolean | null; type_id?: string | null })[]).filter((r) => !r.prices_only).map((r) => ({ ...r, type_name: r.area === "other" && r.type_id ? typeNames.get(r.type_id) ?? null : null }));
  const names = new Map(((pr.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  let projectExpenses: MonthRaw["projectExpenses"] = [];
  if (names.size) {
    const e = await supabase.from("personal_expenses").select("project_id, merchant, category, expense_date, amount_usd").eq("user_id", userId).gte("expense_date", monthStart).lte("expense_date", end).limit(2000);
    projectExpenses = ((e.data ?? []) as { project_id: string; merchant: string | null; category: string | null; expense_date: string; amount_usd: number | string | null }[])
      .filter((x) => names.has(x.project_id)).map((x) => ({ ...x, project_name: names.get(x.project_id)! }));
  }
  let shopItems: MonthRaw["shopItems"] = [];
  if (shopNames.length && receipts.some((r) => r.area !== "other")) {
    const ids = new Set(receipts.filter((r) => r.area !== "other").map((r) => r.id));
    const it = await supabase.from("grocery_items").select("receipt_id, name, category, line_total").eq("user_id", userId).in("category", shopNames).in("receipt_id", [...ids]).limit(5000);
    const byId = new Map(receipts.map((r) => [r.id, r]));
    shopItems = it.error ? [] : ((it.data ?? []) as { receipt_id: string; name: string; category: string | null; line_total: number | string }[]).map((x) => ({ ...x, purchase_date: byId.get(x.receipt_id)!.purchase_date, store: byId.get(x.receipt_id)!.store, currency: byId.get(x.receipt_id)!.currency }));
  }
  return {
    receipts, shopItems,
    utilities: ut.error ? [] : ((ut.data ?? []) as MonthRaw["utilities"]),
    spends: sp.error ? [] : ((sp.data ?? []) as unknown as MonthRaw["spends"]),
    fuel: fu.error ? [] : ((fu.data ?? []) as unknown as NonNullable<MonthRaw["fuel"]>),
    projectExpenses,
    savings: inputs.savings ?? [],
    fixed: inputs.fixed ?? [],
  };
}
