import { AWG_PER_USD, analyze, buildRows, filterRows, resolveRange, toAwg, trendSeries, DEFAULT_FILTER } from "../src/lib/personal/dashboard";
import { FEATURES, effectivePermissions } from "../src/lib/access";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const today = "2026-11-04";
eq("AWG stays", toAwg(100, "AWG", 55.87, {}), 100);
eq("USD peg", toAwg(10, "USD", 10, {}), 17.9);
eq("frozen amount_usd wins", toAwg(100, "EUR", 120, { EUR: 1.1 }), Math.round(120 * AWG_PER_USD * 100) / 100);
eq("rate fallback", toAwg(100, "EUR", null, { EUR: 1.1 }), Math.round(100 * 1.1 * AWG_PER_USD * 100) / 100);
eq("unknown currency -> null", toAwg(100, "XYZ", null, {}), null);

eq("30d range", resolveRange({ range: "30d", from: "", to: "" }, today), { from: "2026-10-06", to: today });
eq("custom swapped", resolveRange({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, today), { from: "2026-10-01", to: "2026-10-10" });

const rows = buildRows(
  [
    { project_id: "p1", merchant: "Ace", amount: 100, currency: "AWG", amount_usd: 55.87, category: "Tools", expense_date: "2026-11-01" },
    { project_id: "p1", merchant: "Ace", amount: 50, currency: "USD", amount_usd: 50, category: "Tools", expense_date: "2026-11-02" },
    { project_id: "p2", merchant: "Hotel", amount: 10, currency: "XYZ", amount_usd: 0, category: "Lodging", expense_date: "2026-10-20" },
    { project_id: "p1", merchant: "Old", amount: 500, currency: "AWG", amount_usd: 279, category: "Other", expense_date: "2025-01-01" },
  ],
  [{ store: "Super Food", purchase_date: "2026-11-03", total: "200.50", currency: "AWG" }],
  {},
);
const f = filterRows(rows, DEFAULT_FILTER, today);
eq("old row filtered out", f.length, 4);
const a = analyze(rows, f, [{ id: "p1", name: "Kitchen", kind: "home_project", start_date: "2026-10-30", end_date: null }, { id: "p2", name: "Trip", kind: "personal_trip", start_date: null, end_date: null }], DEFAULT_FILTER, today);
eq("total", a.total, 100 + 89.5 + 200.5);
eq("unconverted counted", a.unconverted, 1);
eq("avg per day", a.avgPerDay, Math.round(((100 + 89.5 + 200.5) / 30) * 100) / 100);
eq("top category", a.byCategory[0], { label: "Groceries", value: 200.5 });
eq("top merchant", a.topMerchants[0].label, "Super Food");
eq("per project days from start to today", a.perProject.find((p) => p.id === "p1")?.days, 6);
eq("project without dates not listed when all rows unconverted", a.perProject.find((p) => p.id === "p2"), undefined);
eq("stores list", a.stores, ["Ace", "Hotel", "Old", "Super Food"]);
eq("currency totals", a.byCurrency.find((c) => c.currency === "XYZ")?.awg, null);

const store = filterRows(rows, { ...DEFAULT_FILTER, store: "Ace" }, today);
eq("store filter", store.length, 2);
const proj = filterRows(rows, { ...DEFAULT_FILTER, project: "p2" }, today);
eq("project filter", proj.length, 1);
const all = filterRows(rows, { ...DEFAULT_FILTER, range: "all" }, today);
eq("all time", all.length, 5);

const tr = trendSeries(f, "day", resolveRange(DEFAULT_FILTER, today), today);
eq("daily trend fills 30 days", tr.length, 30);
eq("trend sum", Math.round(tr.reduce((s, x) => s + x.value, 0) * 100) / 100, 390);
const wk = trendSeries(f, "week", resolveRange(DEFAULT_FILTER, today), today);
eq("weekly keys are Mondays", wk.every((x) => new Date(x.key + "T00:00:00Z").getUTCDay() === 1), true);
const mo = trendSeries(all, "month", resolveRange({ range: "all", from: "", to: "" }, today), today);
eq("monthly all-time starts at first purchase", mo[0].key, "2025-01-01");
eq("empty trend", trendSeries([], "day", resolveRange(DEFAULT_FILTER, today), today), []);

// Tiles at the top of the Personal view
import { tileSummary } from "../src/lib/personal/dashboard";
const ts = tileSummary(rows, [{ id: "p1", name: "Kitchen", kind: "home_project", status: "active", start_date: null, end_date: null }, { id: "p2", name: "Trip", kind: "personal_trip", status: "completed", start_date: null, end_date: null }], today);
eq("tiles: groceries this month in AWG", ts.grocery, { total: 200.5, currency: "AWG", count: 1 });
eq("tiles: active home project spend (all time)", ts.projects, { count: 1, spent: 100 + 89.5 + 500 });
eq("tiles: completed trip not counted", ts.trips, { count: 0, spent: 0 });

// Previous period, change and busiest day
import { busiestDay, changePercent, previousPeriod } from "../src/lib/personal/dashboard";
eq("no earlier spending -> no comparison", previousPeriod(rows, DEFAULT_FILTER, today), null);
const withPrior = buildRows(
  [
    { project_id: "p1", merchant: "Ace", amount: 100, currency: "AWG", amount_usd: 55.87, category: "Tools", expense_date: "2026-10-20" },
    { project_id: "p1", merchant: "Ace", amount: 300, currency: "AWG", amount_usd: 167.6, category: "Tools", expense_date: "2026-09-20" },
    { project_id: "p1", merchant: "Shop", amount: 50, currency: "AWG", amount_usd: 27.93, category: "Other", expense_date: "2026-09-21" },
  ],
  [],
  {},
);
const pp = previousPeriod(withPrior, DEFAULT_FILTER, today);
eq("previous period is the 30 days before", pp && [pp.from, pp.to, pp.days, pp.total], ["2026-09-06", "2026-10-05", 30, 350]);
eq("previous period respects the store filter", previousPeriod(withPrior, { ...DEFAULT_FILTER, store: "Shop" }, today)?.total, 50);
eq("all time has no comparison", previousPeriod(withPrior, { ...DEFAULT_FILTER, range: "all" }, today), null);
eq("change: less", changePercent(100, 350), -71);
eq("change: more", changePercent(150, 100), 50);
eq("change: nothing before", changePercent(100, null), null);
eq("change: zero before", changePercent(100, 0), null);
eq("busiest day", busiestDay(f), { date: "2026-11-03", value: 200.5 });
eq("busiest day, no rows", busiestDay([]), null);
eq("category filter", filterRows(rows, { ...DEFAULT_FILTER, category: "Groceries" }, today).length, 1);

// Role option
const feat = FEATURES.find((x) => x.key === "personal.dashboard");
eq("feature registered in App group", feat?.group, "App");
eq("user gets it by default", effectivePermissions({ key: "user", permissions: [], known_features: [] }).has("personal.dashboard"), true);
eq("reviewed and unticked = off", effectivePermissions({ key: "user", permissions: ["trips"], known_features: ["personal.dashboard"] }).has("personal.dashboard"), false);
eq("admin has it", effectivePermissions({ key: "admin", permissions: [], known_features: [] }).has("personal.dashboard"), true);
// Grocery money by category: a receipt is shared over its lines' categories and still counts as one receipt
{
  const g = buildRows(
    [],
    [
      { id: "r1", store: "Super Food", purchase_date: "2026-11-03", total: "100.00", currency: "AWG" },
      { id: "r2", store: "Super Food", purchase_date: "2026-11-02", total: "30.00", currency: "AWG" },
    ],
    {},
    [
      { receipt_id: "r1", category: "Produce", line_total: "30.00" },
      { receipt_id: "r1", category: "Produce", line_total: "10.00" },
      { receipt_id: "r1", category: "Dairy", line_total: "20.00" },
      { receipt_id: "r1", category: null, line_total: "0" },
    ],
  );
  const fg = filterRows(g, DEFAULT_FILTER, today);
  const ag = analyze(g, fg, [], DEFAULT_FILTER, today);
  eq("grocery: shared by category, parts add up to the receipts", ag.byCategory, [{ label: "Produce", value: 66.67 }, { label: "Groceries", value: 30 }, { label: "Dairy", value: 33.33 }].sort((x, y) => y.value - x.value));
  eq("grocery: the total is still the receipts' total", ag.total, 130);
  eq("grocery: a split receipt counts once", ag.count, 2);
  eq("grocery: store visits count receipts", ag.topMerchants[0].visits, 2);
  eq("grocery: a receipt with no lines stays one Groceries row", g.filter((r) => r.receiptId === "r2").map((r) => r.category), ["Groceries"]);
  eq("grocery: category filter works on the split", filterRows(g, { ...DEFAULT_FILTER, category: "Dairy" }, today).map((r) => r.awg), [33.33]);
}
process.exit(fail ? 1 : 0);
