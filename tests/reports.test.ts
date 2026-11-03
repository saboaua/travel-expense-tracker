// Run with: npx tsx tests/reports.test.ts
import { summarize, usdOf, pctChange, type ExpenseRow } from "../src/lib/reports";
let failed = 0;
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) failed++; };

const rows: ExpenseRow[] = [
  { amount: 100, amount_usd: 100, currency: "USD", category: "Meals", expense_date: "2025-12-10", merchant: "Cafe", trip_id: "t0" },
  { amount: 200, amount_usd: 200, currency: "USD", category: "Lodging", expense_date: "2025-05-01", trip_id: "t0" },
  { amount: 50, amount_usd: 50, currency: "USD", category: "Meals", expense_date: "2026-01-05", merchant: "cafe", trip_id: "t1" },
  { amount: 150, amount_usd: 150, currency: "USD", category: "Lodging", expense_date: "2026-01-20", merchant: "Hotel A", trip_id: "t1" },
  { amount: 90, amount_usd: "90.00", currency: "AWG", category: "Meals", expense_date: "2026-10-03", merchant: "Cafe", trip_id: "t2" },
  { amount: 40, amount_usd: null, currency: "XCD", category: "Fuel", expense_date: "2026-10-04", trip_id: "t2" },
  { amount: 25, amount_usd: null, currency: "USD", category: null, expense_date: "2026-10-09", trip_id: "t2" },
];

eq(usdOf(rows[5]), null, "foreign without USD is unknown");
eq(usdOf(rows[6]), 25, "USD without amount_usd uses amount");
eq(pctChange(110, 100), 10, "pct change");
eq(pctChange(5, 0), null, "pct change base zero");

const s = summarize(rows, 2026, "2026-10");
eq(s.total, 315, "year total (excludes unknown USD)");
eq(s.expenseCount, 5, "expense count includes unknown");
eq(s.missingUsd, 1, "missing usd counted");
eq(s.prevYearTotal, 300, "previous year total");
eq(s.yearChangePct, 5, "year change %");
eq(s.monthly[0], 200, "january");
eq(s.monthly[9], 115, "october");
eq(s.focusMonthIndex, 9, "focus = current month");
eq(s.focusMonthTotal, 115, "focus total");
eq(s.focusMonthChangePct, null, "no data in september: no change shown");
eq(s.categories.map((c) => c.category), ["Lodging", "Meals", "Other"], "categories sorted, null -> Other");
eq(s.categories.reduce((a, c) => a + c.pct, 0) > 99.5, true, "percentages add up");
eq(s.merchants[1], { name: "cafe", total: 140, count: 2 }, "merchants merged case-insensitively");
eq(s.tripTotals["t1"], { total: 200, count: 2 }, "per trip total");
eq(s.avgPerActiveMonth, 157.5, "avg per active month");

// January compares with December of the previous year
const jan = summarize(rows, 2026, "2026-01");
eq([jan.focusMonthIndex, jan.focusMonthTotal, jan.focusMonthChangePct], [0, 200, 100], "january vs previous december");

// past year: focus on the biggest month
const past = summarize(rows, 2025, "2026-10");
eq([past.total, past.focusMonthIndex], [300, 4], "past year: peak month");

// many categories are merged into Other
const many: ExpenseRow[] = Array.from({ length: 9 }, (_, i) => ({ amount: 10 + i, amount_usd: 10 + i, category: `C${i}`, expense_date: "2026-02-01" }));
const m = summarize(many, 2026, "2026-02");
eq([m.categories.length, m.categories.some((c) => c.category === "Other")], [6, true], "max 6 slices incl. Other");
eq(Math.round(m.categories.reduce((a, c) => a + c.total, 0)), m.total, "slice totals equal year total");
process.exit(failed ? 1 : 0);
