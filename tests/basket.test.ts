import { basketTotals, distanceKm, normStore, sameStore, splitAdvice, storeIndex, usualItems, MIN_SHARED } from "../src/lib/personal/basket";
import { buildProducts } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const NOW = new Date("2026-11-10T12:00:00Z");
const row = (name: string, price: number, store: string, date: string): TrackerRow => ({
  name, normalized_name: name.toLowerCase(), category: "Other", unit_price: price, quantity: 1, unit: null, line_total: price,
  receipt: { store, purchase_date: date, currency: "AWG" },
});

// store names
eq("same shop, other wording", sameStore("Ling & Sons", "Ling and Sons Supermarket"), true);
eq("different shops", sameStore("Ling & Sons", "Super Food Plaza"), false);
eq("normalised", normStore("The Save More Supermarket"), "save more");

// distance: about 1.1 km per 0.01 degree of latitude
const d = distanceKm({ lat: 12.5, lng: -70 }, { lat: 12.51, lng: -70 });
eq("distance ~1.1 km", Math.round(d * 10) / 10, 1.1);

// six products at three stores: A is cheap, C is dear, B is in the middle
const names = ["Milk", "Bread", "Rice", "Eggs", "Butter", "Juice"];
const rows: TrackerRow[] = [];
for (const n of names) {
  rows.push(row(n, 10, "A", "2026-11-01"), row(n, 11, "B", "2026-11-02"), row(n, 12, "C", "2026-11-03"));
}
const { products } = buildProducts(rows);
eq("six products", products.length, 6);
const idx = storeIndex(products, "AWG", NOW);
const by = (s: string) => idx.find((x) => x.store === s)!;
eq("A is the cheapest", by("A").level, "cheapest");
eq("C is the most expensive", by("C").level, "dearest");
eq("B is about average", by("B").level, "average");
eq("A is below the middle price", by("A").pct, -9.1);
eq("shared count", by("A").shared, 6);

// not enough data: a store seen on 2 shared products only
const few = buildProducts([...rows, row("Soap", 5, "D", "2026-11-01"), row("Soap", 6, "A", "2026-11-01")]).products;
eq("a store with little data is not rated", storeIndex(few, "AWG", NOW).find((x) => x.store === "D")?.level, "nodata");
eq("minimum is 5", MIN_SHARED, 5);

// old prices (over 60 days) do not count towards the level
const oldRows = rows.map((r) => (r.receipt.store === "C" ? { ...r, receipt: { ...r.receipt, purchase_date: "2026-05-01" } } : r));
const oldIdx = storeIndex(buildProducts(oldRows).products, "AWG", NOW);
eq("an old price is left out", oldIdx.find((x) => x.store === "C")?.level, "nodata");

// basket totals
const list = [{ key: products.find((p) => p.name === "Milk")!.key, qty: 2 }, { key: products.find((p) => p.name === "Rice")!.key, qty: 1 }];
const b = basketTotals(list, products, ["A", "B", "C"], idx, NOW);
eq("cheapest first", b.map((x) => x.store), ["A", "B", "C"]);
eq("A total", b[0].total, 30);
eq("extra at C", b[2].extra, 6);
eq("all priced", b[0].priced, 2);

// an item never bought at a store is estimated and labelled
const withSoap = buildProducts([...rows, row("Soap", 5, "A", "2026-11-01"), row("Soap", 6, "B", "2026-11-01")]).products;
const soap = withSoap.find((p) => p.name === "Soap")!;
const est = basketTotals([{ key: soap.key, qty: 1 }], withSoap, ["A", "B", "C"], storeIndex(withSoap, "AWG", NOW), NOW).find((x) => x.store === "C")!;
eq("estimated line", [est.estimated, est.lines[0].status], [1, "estimated"]);
eq("estimate is near the middle price", est.lines[0].price! > 5 && est.lines[0].price! < 7, true);

// a price older than 60 days is used but flagged
const stale = buildProducts([...rows.filter((r) => r.receipt.store !== "A"), row("Milk", 9, "A", "2026-06-01")]).products;
const sb = basketTotals([{ key: stale.find((p) => p.name === "Milk")!.key, qty: 1 }], stale, ["A"], [], NOW)[0];
eq("old price flagged", [sb.old, sb.lines[0].status], [1, "old"]);

// usual items: bought twice, due again
const usualRows = [row("Milk", 10, "A", "2026-09-01"), row("Milk", 10, "A", "2026-09-15"), row("Salt", 3, "A", "2026-11-08")];
const u = usualItems(buildProducts(usualRows).products, "AWG", NOW);
eq("only repeat buys", u.map((x) => x.name), ["Milk"]);
eq("due after a usual gap", u[0].due, true);

// a second stop only when it beats the trip
const dist = new Map([["A", 1], ["B", 2]]);
const two = buildProducts([row("Milk", 10, "A", "2026-11-01"), row("Milk", 4, "B", "2026-11-01"), row("Rice", 10, "A", "2026-11-01"), row("Rice", 4, "B", "2026-11-01"), row("Tea", 1, "A", "2026-11-01"), row("Tea", 20, "B", "2026-11-01")]).products;
const all = two.map((p) => ({ key: p.key, qty: 1 }));
const bk = basketTotals(all, two, ["A", "B"], [], NOW);
eq("split advice far but worthwhile", splitAdvice(all, bk, dist)?.stores, [bk[0].store, bk[1].store]);
eq("no split when the trip costs more", splitAdvice(all, bk, new Map([["A", 1], ["B", 40]])), null);

if (fail) process.exit(1);
console.log("PASS basket");
