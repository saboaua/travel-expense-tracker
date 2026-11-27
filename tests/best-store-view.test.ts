import { verdict, unpricedStores, itemGrid, levelRows, sourceNote, levelWords } from "../src/lib/personal/best-store-view";
import type { StoreBasket, BasketLine, StoreIndex } from "../src/lib/personal/basket";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const line = (name: string, total: number | null): BasketLine => ({ key: name.toLowerCase(), name, qty: 1, price: total, total, status: total == null ? "unknown" : "priced", date: "2026-11-01", source: total == null ? null : "own" });
const sb = (store: string, totals: (number | null)[], names = ["Popcorn", "Oreo", "Gouda", "Corona"]): StoreBasket => {
  const lines = totals.map((t, i) => line(names[i], t));
  return { store, total: Math.round(lines.reduce((s, l) => s + (l.total ?? 0), 0) * 100) / 100, lines, priced: lines.filter((l) => l.total != null).length, old: 0, unknown: lines.filter((l) => l.total == null).length, extra: 0, level: "nodata", levelPct: null };
};

// verdict
const a = sb("New Ten Sing", [5.75]), b = sb("My Oreo", [5.95]), c = sb("Ling", [null]);
eq("verdict: saves against the next store", verdict([a, b], 1), { store: "New Ten Sing", rival: "My Oreo", gap: 0.2, priced: 1, of: 1 });
eq("verdict: nobody to compare", verdict([a], 1), { store: "New Ten Sing", rival: null, gap: 0, priced: 1, of: 1 });
eq("verdict: tie", verdict([sb("A", [5]), sb("B", [5])], 1)?.gap, 0);
eq("verdict: none priced", verdict([c], 1), null);
eq("verdict: empty list", verdict([a], 0), null);
// a store that prices more is compared only with stores pricing as many
eq("verdict ignores a store that prices fewer", verdict([sb("Full", [3, 4]), sb("Part", [1, null]), sb("Full2", [4, 4])], 2)?.gap, 1);

// unpriced stores are listed
const near = new Map([["Ling", 2.1], ["Far", 9], ["Unplaced", NaN]]);
const kmOf = (s: string) => { const v = near.get(s); return v == null || Number.isNaN(v) ? null : v; };
const un = unpricedStores([a, c, sb("Far", [null]), sb("Unplaced", [null])], kmOf, 5, true);
eq("only nearby stores with no price", un.map((u) => u.store), ["Ling"]);
eq("what is missing", un[0].missing, ["Popcorn"]);
eq("without a place every unpriced store is listed", unpricedStores([c, sb("Far", [null])], kmOf, 5, false).map((u) => u.store), ["Ling", "Far"]);

// item grid
const g = itemGrid([sb("NTS", [5.75, 3.40, 9.80, null]), sb("Oreo", [5.95, 3.25, 10.20, 11.90]), sb("Folira", [6.00, 3.60, null, 12.50])])!;
eq("grid stores", g.stores, ["NTS", "Oreo", "Folira"]);
eq("cheapest per row", g.rows.map((r) => r.cheapest), [[0], [1], [0], [1]]);
eq("totals use only the shared items", g.totals, [9.15, 9.2, 9.6]);
eq("shared count", g.sharedCount, 2);
eq("leader", g.leader, { index: 0, gap: 0.05 });
eq("items priced", g.priced, [3, 4, 3]);
eq("not all shared", g.allShared, false);
eq("grid needs two stores", itemGrid([a]), null);
eq("a row everyone prices the same has no winner", itemGrid([sb("A", [5, 2]), sb("B", [5, 3])])!.rows.map((r) => r.cheapest), [[], [0]]);
eq("only differing rows are flagged", itemGrid([sb("A", [5, 2]), sb("B", [5, 3])])!.rows.map((r) => r.differs), [false, true]);
eq("at most three stores", itemGrid([sb("A", [1]), sb("B", [2]), sb("C", [3]), sb("D", [4])], 3)!.stores.length, 3);

// price level
const idx: StoreIndex[] = [
  { store: "Ling", pct: 5.4, shared: 7, level: "dearest" }, { store: "NTS", pct: -3.1, shared: 6, level: "cheapest" }, { store: "Folira", pct: 1.7, shared: 5, level: "average" },
  { store: "TUR", pct: null, shared: 3, level: "nodata" }, { store: "Heng", pct: null, shared: 2, level: "nodata" },
];
const lv = levelRows(idx, [sb("NTS", [5.75]), sb("Oreo", [5.95]), sb("Folira", [6]), sb("Ling", [null])], 1);
eq("cheapest first", lv.rated.map((r) => r.store), ["NTS", "Folira", "Ling"]);
eq("where each stands on the list", lv.rated.map((r) => r.listNote), ["cheapest", "3rd of 3", "no price yet"]);
eq("too few shared products come apart, most data first", lv.needMore.map((r) => [r.store, r.shared]), [["TUR", 3], ["Heng", 2]]);
eq("needed", lv.minShared, 5);
eq("no list, no note", levelRows(idx, [], 0).rated[0].listNote, null);

// where prices come from
const NOW = new Date("2026-11-11T12:00:00Z");
const own = sb("A", [5]); own.lines[0].date = "2026-11-09";
eq("source: receipts and age", sourceNote(own, NOW), "Your receipts, 3 days ago");
const mixed = sb("B", [5, 6]); mixed.lines[0].source = "community"; mixed.lines[0].date = "2026-10"; mixed.lines[1].source = "online"; mixed.lines[1].date = "2026-11-07";
eq("source: mixed", sourceNote(mixed, NOW), "Community + Online list, 5 days ago");
eq("source: nothing priced", sourceNote(sb("C", [null]), NOW), null);
eq("level words", [levelWords(5.4), levelWords(-3.1), levelWords(0.2), levelWords(null)], ["5.4% above average", "3.1% below average", "About average", null]);

console.log(fail ? `${fail} FAILED` : "best-store-view: all checks passed");
process.exit(fail ? 1 : 0);
