import { AREA_PREFIX, filterHouse, houseTarget, houseSpends, houseTotalUsd, parseAmount, recentNames, summarizeSpends, type SpendRow } from "../src/lib/personal/quick-spend";
import { withLinkedTotals } from "../src/lib/offline-personal";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const row = (id: string, merchant: string | null, amount: number, date: string, category = "Other", extra: Partial<SpendRow> = {}): SpendRow => ({ id, merchant, amount, currency: "AWG", amount_usd: amount / 2, category, expense_date: date, ...extra });

eq([parseAmount("4.5"), parseAmount("4,50"), parseAmount(""), parseAmount("-2"), parseAmount("abc"), parseAmount("0")], [4.5, 4.5, null, null, null, null], "amounts are read with a comma or a dot, and zero or negative is refused");
eq(summarizeSpends([{ amount: 4.5, currency: "AWG" }, { amount: "3", currency: "AWG" }, { amount: 10, currency: "USD" }]), { currency: "AWG", total: 7.5, count: 2 }, "the month total is in the most-used currency");
eq(summarizeSpends([]), null, "no spends, no total");

const rs = [row("1", "Coffee", 4.5, "2026-11-10", "Coffee & snacks"), row("2", "coffee", 5, "2026-11-12", "Street food"), row("3", "Peanuts", 3, "2026-11-09", "Street food"), row("4", null, 9, "2026-11-08")];
eq(recentNames(rs).map((n) => [n.name, n.category, n.amount]), [["Coffee", "Street food", 5], ["Peanuts", "Street food", 3]], "recent names: most used first, with the last category and amount, blanks skipped");

const house = [
  row("h1", "Sliding door mechanism", 86, "2026-11-12", "House"),
  row("h2", "Door lock", 54.5, "2026-11-03", "House"),
  row("h3", "Faucet", 120, "2026-10-21", "House", { project_id: "p1" }),
  row("h4", "Paint", 98, "2026-10-18", "Other", { project_id: "p1" }),
  row("h5", "Old lamp", 20, "2025-12-30", "House"),
  row("h6", "Coffee", 4.5, "2026-11-10", "Coffee & snacks"),
];
const y = houseSpends(house, "2026");
eq(y.map((r) => r.id), ["h1", "h2", "h3", "h4"], "House list: this year only, House or attached to a project, newest first");
eq(houseTotalUsd(y), 179.25, "the House total adds the USD amounts");
eq([filterHouse(y, "all").length, filterHouse(y, "none").map((r) => r.id), filterHouse(y, "p1").map((r) => r.id)], [4, ["h1", "h2"], ["h3", "h4"]], "filters: all, no project, one project");

const projects = [{ id: "p1", personal_expenses: [{ amount_usd: 10 }] }, { id: "p2", personal_expenses: [] }];
const merged = withLinkedTotals(projects, [{ project_id: "p1", amount_usd: 60 }, { project_id: "p1", amount_usd: 49 }]);
eq([merged[0].personal_expenses?.length, merged[0].personal_expenses?.reduce((s, e) => s + Number(e.amount_usd), 0), merged[1].personal_expenses?.length], [3, 119, 0], "attached spends count in the project's total and number");
eq(withLinkedTotals(projects, []), projects, "no attached spends leaves the projects as they are");

const withArea: SpendRow[] = [
  row("a1", "Tile grout", 38, "2026-10-09", "House", { house_area: "Bathroom" }),
  row("a2", "Roof sealant", 113.5, "2026-09-02", "Other", { house_area: "Roof" }),
  row("a3", "Door lock", 54.5, "2026-11-03", "House"),
  row("a4", "Faucet", 120, "2026-10-21", "House", { project_id: "p1" }),
];
const ya = houseSpends(withArea, "2026");
eq(ya.length, 4, "a spend with an area counts as House even when its category is Other");
eq(filterHouse(ya, `${AREA_PREFIX}Bathroom`).map((r) => r.id), ["a1"], "filter by an area");
eq(filterHouse(ya, "none").map((r) => r.id), ["a3"], "no project and no area is the loose repairs");
eq([houseTarget(""), houseTarget("p1"), houseTarget("area:Roof")], [{}, { project_id: "p1" }, { house_area: "Roof" }], "the dropdown value becomes a project or an area");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("quick-spend: all checks passed");
