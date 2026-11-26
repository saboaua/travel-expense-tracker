import { addedExternal, addedProduct, cheapestOffer, listedKey, sanitizeAdded, DEFAULT_SETTINGS, directionsUrl, everyText, habitItems, learning, planCart, splitRuns, tripsPerMonth, sanitizeSettings, smartBaskets, storeDetail, storeRows, tour, usualStore } from "../src/lib/personal/smart-cart";
import { buildProducts } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";
import type { ExternalPrice, LatLng } from "../src/lib/personal/basket";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const NOW = new Date("2026-11-10T12:00:00Z");
const row = (name: string, price: number, store: string, date: string, qty = 1): TrackerRow => ({
  name, normalized_name: name.toLowerCase(), category: "Other", unit_price: price, quantity: qty, unit: null, line_total: price * qty,
  receipt: { store, purchase_date: date, currency: "AWG" },
});
const rows: TrackerRow[] = [];
for (const [n, p] of [["Milk", 10], ["Eggs", 12], ["Paste", 5]] as const) rows.push(row(n, p, "Usual Mart", "2026-10-01"), row(n, p, "Usual Mart", "2026-10-20"));
rows.push(row("Milk", 10, "Usual Mart", "2026-11-01"));
rows.push(row("Soap", 3, "Usual Mart", "2026-10-02"), row("Soap", 3, "Usual Mart", "2026-10-21"), row("Rare", 9, "Usual Mart", "2026-10-21"));
const { products } = buildProducts(rows);
const key = (n: string) => products.find((p) => p.name.toLowerCase() === n.toLowerCase())!.key;

// habits
const habits = habitItems(products, "AWG", NOW);
eq("usual items need two purchase days", habits.map((h) => h.name.toLowerCase()).sort(), ["eggs", "milk", "paste", "soap"]);
eq("typical gap", habits.find((h) => h.key === key("Milk"))?.everyDays, 16);
eq("typical quantity", habits.find((h) => h.key === key("Milk"))?.qty, 1);
const twos = buildProducts([row("Water", 2, "Usual Mart", "2026-10-01", 6), row("Water", 2, "Usual Mart", "2026-10-15", 6)]).products;
eq("usual quantity of 6", habitItems(twos, "AWG", NOW)[0]?.qty, 6);
eq("old habits drop out", habitItems(products, "AWG", new Date("2027-06-01T00:00:00Z")).length, 0);
eq("every text days", everyText(6), "Every 6 days");
eq("every text weeks", everyText(21), "Every 3 weeks");
eq("every text months", everyText(70), "Every 2 months");
eq("every text none", everyText(null), "Bought a few times");
eq("learning is ready", learning(products, "AWG", NOW).ready, true);
eq("learning is not ready with 2 purchases", learning(twos, "AWG", NOW).ready, false);

// settings
eq("defaults", sanitizeSettings(null), DEFAULT_SETTINGS);
eq("silly numbers are clamped", sanitizeSettings({ perKm: -3, maxKm: 9999, maxStops: 7, minSaving: "abc", includeDriving: "yes" }), { ...DEFAULT_SETTINGS, perKm: 0, maxKm: 100, maxStops: 3 });
eq("comma decimals", sanitizeSettings({ perKm: "0,5" }).perKm, 0.5);

// driving
const home: LatLng = { lat: 12.5, lng: -70 };
const at = (dLat: number): LatLng => ({ lat: 12.5 + dLat, lng: -70 });
eq("one stop out and back with the road allowance", tour(home, [at(0.01)]).km, 2.89);
eq("no stops", tour(home, []).km, 0);
eq("two stops on one road", tour(home, [at(0.05), at(0.01)]).km, 14.46);
const url = directionsUrl(home, [at(0.01), at(0.03)])!;
eq("directions end at the last stop", url.includes("destination=12.530000,-70.000000"), true);
eq("directions pass the first stop", url.includes("waypoints=12.510000%2C-70.000000"), true);
eq("directions start from you", url.includes("origin=12.500000,-70.000000"), true);
eq("directions with one stop have no waypoints", directionsUrl(null, [at(0.01)])!.includes("waypoints"), false);
eq("no stops, no link", directionsUrl(home, []), null);

// plans: Usual Mart (own receipts) near, A cheaper on milk and paste, B cheaper on eggs
const ext: ExternalPrice[] = [
  { store: "Shop A", key: key("Milk"), price: 8, source: "community" }, { store: "Shop A", key: key("Eggs"), price: 12.5, source: "community" }, { store: "Shop A", key: key("Paste"), price: 4, source: "online" },
  { store: "Shop B", key: key("Milk"), price: 10.5, source: "community" }, { store: "Shop B", key: key("Eggs"), price: 9, source: "community" }, { store: "Shop B", key: key("Paste"), price: 5.5, source: "community" },
];
const items = ["Milk", "Eggs", "Paste"].map((n) => ({ key: key(n), qty: 1 }));
const stores = ["Usual Mart", "Shop A", "Shop B"];
const where = new Map<string, LatLng>([["Usual Mart", at(0.01)], ["Shop A", at(0.03)], ["Shop B", at(0.05)]]);
const usual = usualStore(items, products);
eq("usual store", usual, "Usual Mart");
const free = { ...DEFAULT_SETTINGS, perKm: 0, minSaving: 0.01 };
const baskets = smartBaskets(items, products, stores, NOW, ext, free, "AWG");
const set = planCart({ items, baskets, where, origin: home, usual, s: free });
eq("a third stop that buys nothing is not a stop", set.plans.length, 2);
eq("usual total", set.usualTotal, 27);
eq("one stop saves what the best single store saves", set.plans[0].stops.map((s) => s.store), ["Shop A"]);
eq("one stop saving", set.plans[0].saving, 2.5);
eq("two stops: A and B", set.plans[1].stops.map((s) => s.store).sort(), ["Shop A", "Shop B"]);
eq("two stops saving", set.plans[1].saving, 6);
eq("two stops buy eggs at B", set.plans[1].stops.find((s) => s.store === "Shop B")?.lines.map((l) => l.name.toLowerCase()), ["eggs"]);
eq("items total at two stops", set.plans[1].itemsTotal, 21);
eq("best with free driving is the most saving", set.best, 1);
eq("the usual store itself is a plan with no saving", planCart({ items, baskets, where: new Map([["Usual Mart", at(0.01)]]), origin: home, usual, s: free }).plans[0].saving, 0);

// driving costs money: a high price per km makes the extra stops not worth it
const dear = { ...DEFAULT_SETTINGS, perKm: 10 };
const dearSet = planCart({ items, baskets: smartBaskets(items, products, stores, NOW, ext, dear, "AWG"), where, origin: home, usual, s: dear });
eq("nothing beats the usual store when driving is dear", dearSet.best, -1);
eq("driving is charged against the usual trip", dearSet.plans[1].driving > 0, true);
eq("the usual store needs no extra driving", dearSet.plans[0].driving, 0);
// a further stop must add the smallest worthwhile saving
const picky = { ...DEFAULT_SETTINGS, perKm: 0, minSaving: 4 };
const pickySet = planCart({ items, baskets: smartBaskets(items, products, stores, NOW, ext, picky, "AWG"), where, origin: home, usual, s: picky });
eq("a second stop adding 3 is not worth 4", pickySet.best, 0);
// driving not counted
const off = { ...free, includeDriving: false, perKm: 10 };
eq("driving not counted", planCart({ items, baskets: smartBaskets(items, products, stores, NOW, ext, off, "AWG"), where, origin: home, usual, s: off }).plans[1].driving, 0);
// distance limit
const near = { ...free, maxKm: 2 };
eq("stores beyond the limit are not planned", planCart({ items, baskets, where, origin: home, usual, s: near }).plans.flatMap((p) => p.stops.map((s) => s.store)), ["Usual Mart"]);
eq("no place to start, no plan", planCart({ items, baskets, where, origin: null, usual, s: free }).plans.length, 0);
eq("an empty cart, no plan", planCart({ items: [], baskets, where, origin: home, usual, s: free }).plans.length, 0);
// price sources
const noCom = { ...free, useCommunity: false };
eq("a source that is off does not count", smartBaskets(items, products, stores, NOW, ext, noCom, "AWG").find((b) => b.store === "Shop B")?.priced, 0);
const noOwn = { ...free, useOwn: false };
eq("own receipts off", smartBaskets(items, products, stores, NOW, ext, noOwn, "AWG").find((b) => b.store === "Usual Mart")?.priced, 0);
// an item no store prices is left out, never guessed
const withRare = [...items, { key: key("Rare"), qty: 1 }];
const rareSet = planCart({ items: withRare, baskets: smartBaskets(withRare, products, stores, NOW, ext, free, "AWG"), where, origin: home, usual, s: free });
eq("a priced-nowhere-else item is bought at the usual store only", rareSet.plans[2].covered >= 3, true);
// old prices
const olds = buildProducts([row("Tea", 4, "Usual Mart", "2026-06-01"), row("Tea", 4, "Usual Mart", "2026-06-20")]).products;
const oldItems = [{ key: olds[0].key, qty: 1 }];
eq("an old price is flagged but counted", storeRows({ items: oldItems, baskets: smartBaskets(oldItems, olds, ["Usual Mart"], NOW, [], free, "AWG"), where, origin: home, usual: "Usual Mart", s: free })[0]?.lines[0].old, true);
eq("an old price can be left out", storeRows({ items: oldItems, baskets: smartBaskets(oldItems, olds, ["Usual Mart"], NOW, [], { ...free, useOld: false }, "AWG"), where, origin: home, usual: "Usual Mart", s: { ...free, useOld: false } }).length, 0);

// every supermarket
const rowsAll = storeRows({ items, baskets, where, origin: home, usual, s: { ...free, includeDriving: false } });
eq("all three stores listed", rowsAll.map((r) => r.store), ["Shop A", "Shop B", "Usual Mart"]);
eq("totals", rowsAll.map((r) => r.total), [24.5, 25, 27]);
eq("against the usual store", rowsAll.map((r) => r.vsUsual), [-2.5, -2, null]);
eq("the usual store is marked", rowsAll.find((r) => r.usual)?.store, "Usual Mart");
eq("distance shown", rowsAll.find((r) => r.store === "Shop A")?.km, 4.34);
eq("a store with fewer items priced comes after", storeRows({ items, baskets: smartBaskets(items, products, stores, NOW, ext.filter((e) => e.store !== "Shop B" || e.key === key("Eggs")), free, "AWG"), where, origin: home, usual, s: free }).map((r) => r.store).pop(), "Shop B");
eq("stores beyond the limit are left out", storeRows({ items, baskets, where, origin: home, usual, s: near }).map((r) => r.store), ["Usual Mart"]);

// items added by hand
eq("same words, same key", listedKey("Coconut  MILK", "400 ML"), listedKey("coconut milk", "400ml"));
eq("a different size is a different item", listedKey("Coconut milk", "400 ml") === listedKey("Coconut milk", "1 l"), false);
eq("accents and punctuation are ignored", listedKey("Crème fraîche!", null), "x:creme fraiche|");
const mess = sanitizeAdded([
  { key: "x:a|", name: " Coconut   milk ", size: "400 ml", qty: 500, kind: "listed", offers: [{ store: "Ling & Sons", price: 3.19, source: "online" }, { store: "Bad", price: -1, source: "online" }, { store: "Odd", price: 2, source: "own" }, { store: "", price: 2, source: "online" }] },
  { key: "x:a|", name: "dup", kind: "listed" }, { key: "plain", name: "no x prefix", kind: "listed" }, { key: "k1", name: "Eggs", kind: "own", qty: 0, offers: [{ store: "A", price: 1, source: "online" }] },
  { name: "no key", kind: "own" }, "junk", null, { key: "k2", name: "x", kind: "other" },
]);
eq("added items are made safe", mess.map((a) => [a.key, a.name, a.qty, a.offers.length]), [["x:a|", "Coconut milk", 99, 1], ["k1", "Eggs", 1, 0]]);
eq("not a list", sanitizeAdded({ a: 1 }), []);
eq("no more than 20", sanitizeAdded(Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, name: `n${i}`, kind: "own" }))).length, 20);
const coco = { key: listedKey("Coconut milk", "400 ml"), name: "Coconut milk", size: "400 ml", qty: 2, kind: "listed" as const, offers: [{ store: "Shop B", price: 3.5, source: "online" as const }, { store: "Shop A", price: 3.19, source: "community" as const }] };
eq("the cheapest price found", cheapestOffer(coco), { store: "Shop A", price: 3.19 });
eq("no price found", cheapestOffer({ ...coco, offers: [] }), null);
eq("an own item brings no outside prices", addedExternal({ ...coco, kind: "own" }), []);
const cocoExt = addedExternal(coco);
const withCoco = [...items, { key: coco.key, qty: 2 }];
const prods2 = [...products, addedProduct(coco, "AWG")];
const baskets2 = smartBaskets(withCoco, prods2, ["Usual Mart", "Shop A", "Shop B"], NOW, [...ext, ...cocoExt], free, "AWG");
const set2 = planCart({ items: withCoco, baskets: baskets2, where, origin: home, usual, s: free });
const cocoLine = set2.plans[1].stops.flatMap((st) => st.lines.map((l) => [st.store, l.name, l.qty, l.total, l.source])).find((l) => l[1] === "Coconut milk");
eq("an added item is bought where it is cheapest", cocoLine, ["Shop A", "Coconut milk", 2, 6.38, "community"]);
eq("it has no usual-store price, so no saving is claimed", set2.plans[1].stops.flatMap((st) => st.lines).find((l) => l.name === "Coconut milk")?.saving, null);
const none = { ...coco, key: listedKey("Sparkling water", "1.5 l"), name: "Sparkling water", offers: [] };
const set3 = planCart({ items: [...items, { key: none.key, qty: 1 }], baskets: smartBaskets([...items, { key: none.key, qty: 1 }], [...products, addedProduct(none, "AWG")], stores, NOW, ext, free, "AWG"), where, origin: home, usual, s: free });
eq("an item with no price anywhere is left out, never guessed", [set3.plans[1].covered, set3.plans[1].uncovered], [3, 1]);

// like-for-like savings, per stop and per store
eq("the saving is worked out on the items priced at the usual store and another store", [set.comparable, set.itemCount], [3, 3]);
eq("a second stop says what it adds", [set.plans[0].adds, set.plans[1].adds], [null, 3.5]);
const aStop = set.plans[0].stops[0];
eq("a stop says how many items it is compared on and cheaper on", [aStop.comparedOn, aStop.cheaperOn, aStop.pct], [3, 2, 9]);
eq("a normal saving is not flagged", set.plans[1].checks, 0);
const wild: ExternalPrice[] = [{ store: "Shop A", key: key("Milk"), price: 4, source: "community" }];
const wildSet = planCart({ items, baskets: smartBaskets(items, products, stores, NOW, wild, free, "AWG"), where, origin: home, usual, s: free });
eq("a saving over 40% on one item is flagged to check", [wildSet.plans[0].checks, wildSet.plans[0].stops[0].lines.find((l) => l.key === key("Milk"))?.check], [1, true]);
eq("shopping trips a month from the days you shopped", tripsPerMonth(products, "AWG", NOW), 5);
eq("too few shopping days, no pace", tripsPerMonth(twos, "AWG", NOW), null);
const fiveKeys = ["Milk", "Eggs", "Paste", "Soap", "Rare"].map((n) => ({ key: key(n), qty: 1 }));
const ext5: ExternalPrice[] = [...ext.filter((e) => e.store === "Shop A"), { store: "Shop A", key: key("Soap"), price: 2.7, source: "community" }, { store: "Shop A", key: key("Rare"), price: 8.1, source: "community" }];
const rows5 = storeRows({ items: fiveKeys, baskets: smartBaskets(fiveKeys, products, ["Usual Mart", "Shop A"], NOW, ext5, free, "AWG"), where, origin: home, usual, s: free });
const a5 = rows5.find((r) => r.store === "Shop A")!;
eq("a store compared on 5 items shows an average", [a5.compared, a5.avgPct, a5.confidence], [5, -9, "strong"]);
const a3 = storeRows({ items, baskets, where, origin: home, usual, s: free }).find((r) => r.store === "Shop A")!;
eq("fewer than 5 items to compare, no average", [a3.compared, a3.avgPct, a3.confidence], [3, null, "few"]);
eq("the usual store has no average", storeRows({ items, baskets, where, origin: home, usual, s: free }).find((r) => r.usual)?.confidence, null);

// "Cheapest" is the lowest average against the usual store, never just the store that prices most
eq("the store with the lowest average is Cheapest, and comes first", [rows5[0].store, rows5[0].cheapest, rows5.filter((r) => r.cheapest).length], ["Shop A", true, 1]);
eq("with too few items to compare, nobody is Cheapest", storeRows({ items, baskets, where, origin: home, usual, s: free }).some((r) => r.cheapest), false);
const dear5: ExternalPrice[] = fiveKeys.map((k) => ({ store: "Shop A", key: k.key, price: 99, source: "community" as const }));
const rowsDear = storeRows({ items: fiveKeys, baskets: smartBaskets(fiveKeys, products, ["Usual Mart", "Shop A"], NOW, dear5, free, "AWG"), where, origin: home, usual, s: free });
eq("when no one beats the usual store, it is the cheapest", rowsDear.filter((r) => r.cheapest).map((r) => r.store), ["Usual Mart"]);

// one store, item by item
const dA = storeDetail({ store: "Shop A", items, baskets, usual, s: free })!;
eq("a store against the usual one: saving, cheaper, dearer", [dA.saving, dA.cheaper, dA.dearer, dA.compared, dA.pct, dA.confidence], [2.5, 2, 1, 3, null, "few"]);
eq("biggest saving first", dA.lines.map((l) => l.name.toLowerCase()), ["milk", "paste", "eggs"]);
eq("each line carries the usual store price", dA.lines[0].ref, { store: "Usual Mart", price: 10 });
eq("nothing missing", dA.notPriced, []);
const dU = storeDetail({ store: "Usual Mart", items, baskets, usual, s: free })!;
eq("the usual store says where else it is cheaper", [dU.isUsual, dU.elsewhere.count, dU.elsewhere.saving], [true, 3, 6]);
eq("each line at the usual store names the cheaper store", dU.lines.map((l) => [l.name.toLowerCase(), l.better?.store, l.better?.saving]).sort(), [["eggs", "Shop B", 3], ["milk", "Shop A", 2], ["paste", "Shop A", 1]]);
const dB = storeDetail({ store: "Shop B", items: [...items, { key: key("Soap"), qty: 1 }], baskets: smartBaskets([...items, { key: key("Soap"), qty: 1 }], products, stores, NOW, ext, free, "AWG"), usual, s: free })!;
eq("an item with no price here is listed as not counted", dB.notPriced.map((n) => n.toLowerCase()), ["soap"]);
eq("at the usual store a dearer item says what it costs more than the cheapest other store", dU.lines.find((l) => l.name.toLowerCase() === "eggs")?.elsewhere, { store: "Shop B", price: 9, diff: 3 });
eq("a store that is the cheapest for an item has a negative difference", dA.lines.find((l) => l.name.toLowerCase() === "milk")?.elsewhere?.diff, -2);
const mm: ExternalPrice[] = [{ store: "Folira", key: key("Milk"), price: 5.75, source: "community" }, { store: "Amazing", key: key("Milk"), price: 5.5, source: "community" }];
const mmItems = [{ key: key("Milk"), qty: 1 }];
const dF = storeDetail({ store: "Folira", items: mmItems, baskets: smartBaskets(mmItems, products, ["Folira", "Amazing"], NOW, mm, free, "AWG"), usual: null, s: free })!;
eq("with no usual store the line still compares with the other store: 0.25 more", dF.lines[0].elsewhere, { store: "Amazing", price: 5.5, diff: 0.25 });
eq("an unknown store has no detail", storeDetail({ store: "Nowhere", items, baskets, usual, s: free }), null);

if (fail) { console.error(`${fail} smart cart check(s) failed`); process.exit(1); }
// weekly run and monthly stock-up
{
  const hab = (k: string, d: number | null) => ({ key: key(k), name: k, size: null, count: 3, everyDays: d, qty: 1, lastDate: "2026-11-01" });
  const habs = [hab("Milk", 7), hab("Eggs", 10), hab("Paste", 40)];
  const split = splitRuns({ items, habits: habs, baskets, where, origin: home, usual, s: free, minItems: 1 })!;
  eq("weekly items", split.weekly.items.map((i) => i.key).sort(), [key("Eggs"), key("Milk")].sort());
  eq("stock-up items", split.stockup.items.map((i) => i.key), [key("Paste")]);
  eq("the weekly run is one stop", split.weekly.plan?.stops.length, 1);
  eq("a month counts a weekly run about 4.3 times", split.monthlyNet, Math.round((split.weekly.net * 52 / 12 + split.stockup.net) * 100) / 100);
  eq("too small a run is not offered", splitRuns({ items, habits: habs, baskets, where, origin: home, usual, s: free }), null);
  eq("no split without a starting point", splitRuns({ items, habits: habs, baskets, where, origin: null, usual, s: free, minItems: 1 }), null);
  eq("no split when driving is not counted", splitRuns({ items, habits: habs, baskets, where, origin: home, usual, s: { ...free, includeDriving: false }, minItems: 1 }), null);
  eq("no split when everything is weekly", splitRuns({ items, habits: [hab("Milk", 7), hab("Eggs", 7), hab("Paste", 7)], baskets, where, origin: home, usual, s: free, minItems: 1 }), null);
}

console.log("smart cart ok");
