import { DEFAULT_SETTINGS, directionsUrl, everyText, habitItems, learning, planCart, sanitizeSettings, smartBaskets, storeRows, tour, usualStore } from "../src/lib/personal/smart-cart";
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

if (fail) { console.error(`${fail} smart cart check(s) failed`); process.exit(1); }
console.log("smart cart ok");
