import { parseSize, atomOf, buildProducts, looksAlike, wordsClose, cleanName, summarizeStores, historyWithChange, matchesFilter, priceSummary } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

const row = (name: string, price: number, store: string, date: string, extra: Partial<TrackerRow> = {}): TrackerRow => ({
  name, normalized_name: "x", category: "Beverages", unit_price: price, quantity: 1, unit: null, line_total: price,
  receipt: { store, purchase_date: date, currency: "AWG" }, ...extra,
});

// sizes
eq("33cl is 330 ml", parseSize("Corona Extra Bot 33CL")?.label, "330 ml");
eq("330ml same amount", [parseSize("Corona 330ML")?.amount, parseSize("Corona 33CL")?.amount], [330, 330]);
eq("1.5L", parseSize("Cola 1.5L")?.label, "1.5 L");
eq("1,5 l with comma", parseSize("Cola 1,5 l")?.amount, 1500);
eq("500g", parseSize("Rice 500G")?.label, "500 g");
eq("1kg", parseSize("Rice 1KG")?.amount, 1000);
eq("12 ct", parseSize("Eggs 12 CT")?.label, "12 ct");
eq("volume wins over pack count", parseSize("Beer 6PK 330ML")?.label, "330 ml");
eq("no size", parseSize("Bananas"), null);

// names
eq("packaging words dropped", cleanName("Corona Extra Bot 33CL"), "Corona Extra");
eq("cold dropped", cleanName("Corona Extra 330ML Cold"), "Corona Extra");
eq("never empty", cleanName("Bot"), "Bot");

// the user's two Corona receipts from two stores are one product
const corona = [
  row("Corona Extra Bot 33CL", 5.49, "Plaza Market", "2026-11-06"),
  row("Corona Extra 330ML Cold", 5.75, "Corner Mart", "2026-11-07"),
];
const r1 = buildProducts(corona);
eq("two wordings, one product", r1.products.length, 1);
const p = r1.products[0];
eq("name and size", [p.name, p.size], ["Corona Extra", "330 ml"]);
eq("cheapest store", p.cheapestStore, "Plaza Market");
eq("saving against the store bought last", p.saving, { amount: 0.26, pct: 4.52, from: "Corner Mart", to: "Plaza Market" });
eq("both stores listed, cheapest first", p.stores.map((s) => [s.store, s.cheapest, s.extra, s.extraPct]), [["Plaza Market", true, 0, 0], ["Corner Mart", false, 0.26, 4.7]]);
eq("two wordings kept", p.names.length, 2);

// different sizes are never combined
const sizes = buildProducts([row("Corona Extra 330ML", 5.5, "A", "2026-11-01"), row("Corona Extra 1L", 12, "A", "2026-11-02")]);
eq("sizes stay apart", sizes.products.length, 2);
eq("and are not even suggested", sizes.suggestions.length, 0);

// same store over time
const same = buildProducts([
  row("Eggs 12 ct", 6.5, "A", "2026-10-01"), row("Eggs 12 ct", 6.95, "A", "2026-10-18"), row("Eggs 12 ct", 7.8, "A", "2026-11-08"),
]).products[0];
eq("trend up at the same store", [same.trend, same.changePct], ["up", 12.2]);
eq("one store, no cheapest, no saving", [same.cheapestStore, same.saving], [null, null]);
eq("history newest first with change vs previous at that store", same.history.map((h) => [h.price, h.changePct]), [[7.8, 12.2], [6.95, 6.9], [6.5, null]]);

// the change is against the same store, not the other one
const mixed = historyWithChange([
  { date: "2026-10-03", store: "A", price: 5.25, name: "x" }, { date: "2026-10-14", store: "B", price: 5.95, name: "x" },
  { date: "2026-11-06", store: "A", price: 5.49, name: "x" }, { date: "2026-11-07", store: "B", price: 5.75, name: "x" },
]);
eq("change per store", mixed.map((h) => [h.store, h.changePct]), [["B", -3.4], ["A", 4.6], ["B", null], ["A", null]]);

// stale prices are flagged
const old = summarizeStores([{ date: "2026-05-01", price: 4, store: "A" }, { date: "2026-11-01", price: 5, store: "B" }]);
eq("old price flagged", old.map((s) => [s.store, s.stale]), [["A", true], ["B", false]]);

// suggestions: alike but not certain
const ketchup = buildProducts([row("Heinz Ketchup 400G", 4, "A", "2026-11-01"), row("Heinz Tomato Ketchup 400 G", 4.2, "B", "2026-11-02")]);
eq("two products until you say so", ketchup.products.length, 2);
eq("one suggestion", ketchup.suggestions.length, 1);
const [ka, kb] = [ketchup.suggestions[0].keyA, ketchup.suggestions[0].keyB];
eq("yes combines them", buildProducts([row("Heinz Ketchup 400G", 4, "A", "2026-11-01"), row("Heinz Tomato Ketchup 400 G", 4.2, "B", "2026-11-02")], [{ key_a: ka, key_b: kb, same: true }]).products.length, 1);
const no = buildProducts([row("Heinz Ketchup 400G", 4, "A", "2026-11-01"), row("Heinz Tomato Ketchup 400 G", 4.2, "B", "2026-11-02")], [{ key_a: ka, key_b: kb, same: false }]);
eq("no keeps them apart and stops asking", [no.products.length, no.suggestions.length], [2, 0]);

// undo an automatic match
const [c1, c2] = [atomOf("Corona Extra Bot 33CL", "AWG", null).key, atomOf("Corona Extra 330ML Cold", "AWG", null).key];
eq("not the same product splits them", buildProducts(corona, [{ key_a: c1, key_b: c2, same: false }]).products.length, 2);
eq("other currency never matches", buildProducts([row("Corona Extra 330ML", 5, "A", "2026-11-01"), row("Corona Extra 330ML", 3, "B", "2026-11-02", { receipt: { store: "B", purchase_date: "2026-11-02", currency: "USD" } })]).products.length, 2);


// the real chips: a brand word in front, a misread letter, and a size on one side only
const lays = buildProducts([row("Lays Sour Cream & Onion 170 g", 8.5, "AMAZING MARKET", "2026-11-11", { category: "Snacks" }), row("Frito Lays Sour Cream & Union", 9.2, "Ling & Sons", "2026-11-06", { category: "Snacks" })]);
eq("lays: still two products until you say so", lays.products.length, 2);
eq("lays: one suggestion", lays.suggestions.length, 1);
eq("lays: price gap shown as a hint", lays.suggestions[0]?.priceGapPct, 7.6);
eq("lays: yes combines them", buildProducts([row("Lays Sour Cream & Onion 170 g", 8.5, "AMAZING MARKET", "2026-11-11"), row("Frito Lays Sour Cream & Union", 9.2, "Ling & Sons", "2026-11-06")], [{ key_a: lays.suggestions[0].keyA, key_b: lays.suggestions[0].keyB, same: true }]).products.length, 1);
// no size on either side
const mm = buildProducts([row("M&M Peanut Share", 5.89, "NEW HUA RUN", "2026-11-11"), row("M&M Peanut", 5.5, "AMAZING MARKET", "2026-11-11")]);
eq("m&m: peanut share and peanut are offered", mm.suggestions.length, 1);
eq("m&m: king size is a different product", buildProducts([row("M&M Peanut Share", 5.89, "A", "2026-11-11"), row("M&M King Size", 5.9, "B", "2026-11-11")]).suggestions.length, 0);
eq("a different size is never offered", buildProducts([row("Lays Sour Cream 170 g", 8.5, "A", "2026-11-11"), row("Lays Sour Cream 50 g", 3, "B", "2026-11-11")]).suggestions.length, 0);
eq("a price far apart is not offered", buildProducts([row("Lays Sour Cream", 8.5, "A", "2026-11-11"), row("Frito Lays Sour Cream", 2, "B", "2026-11-11")]).suggestions.length, 0);
const asked = buildProducts([row("Lays Sour Cream", 8, "A", "2026-11-11"), row("Frito Lays Sour Cream", 12, "B", "2026-11-11"), row("Lays Sour Cream Chips", 8.2, "C", "2026-11-11")]).suggestions[0];
eq("closest price is asked first", [asked.a.name, asked.b.name].sort(), ["Lays Sour Cream", "Lays Sour Cream Chips"]);
eq("onion and union are one letter apart", wordsClose("onion", "union"), true);
eq("short words must match exactly", wordsClose("cola", "coca"), false);
eq("different words stay different", wordsClose("peanut", "peach"), false);
eq("a missing letter in a long word is close", wordsClose("cheddar", "chedar"), true);

// a name with no size joins the same name with its size when that is the only size there is (the Corona Extra case)
const coronaAll = buildProducts([
  row("Corona Extra 330 ml", 5.49, "Ling & Sons", "2026-11-07"), row("Corona Extra 330 ml", 5.75, "New Ten Sing Supermarket", "2026-11-03"),
  row("Corona Extra", 5.95, "My Oreo Supermarket", "2026-11-13"), row("Corona Extra", 6, "FOLIRA Supermarket", "2026-11-10"),
]);
eq("corona: 330 ml and no size are one product", coronaAll.products.length, 1);
eq("corona: four stores together, best price is the lowest", [coronaAll.products[0].stores.length, coronaAll.products[0].stats.min, coronaAll.products[0].size, coronaAll.products[0].name], [4, 5.49, "330 ml", "Corona Extra"]);
eq("corona: nothing left to suggest", coronaAll.suggestions.length, 0);
const twoSizes = buildProducts([row("Corona Extra 330 ml", 5.5, "A", "2026-11-07"), row("Corona Extra 710 ml", 9, "B", "2026-11-07"), row("Corona Extra", 5.9, "C", "2026-11-13")]);
eq("corona: with two sizes the bare name cannot be placed, so it stays apart", twoSizes.products.length, 3);
eq("corona: a no on a pair keeps them apart", buildProducts([row("Corona Extra 330 ml", 5.49, "A", "2026-11-07"), row("Corona Extra", 5.95, "B", "2026-11-13")], [{ key_a: atomOf("Corona Extra 330 ml", "AWG", null).key, key_b: atomOf("Corona Extra", "AWG", null).key, same: false }]).products.length, 2);
eq("corona: another currency is never joined", buildProducts([row("Corona Extra 330 ml", 5.49, "A", "2026-11-07"), row("Corona Extra", 5.95, "B", "2026-11-13", { receipt: { store: "B", purchase_date: "2026-11-13", currency: "USD" } })]).products.length, 2);
eq("a bare name joins a sized one with a count too (eggs)", buildProducts([row("Eggs 12 ct", 6, "A", "2026-11-07"), row("Eggs", 6.3, "B", "2026-11-13")]).products.length, 1);

// looksAlike
eq("subset of two words", looksAlike(["heinz", "ketchup"], ["heinz", "ketchup", "tomato"]), true);
eq("single shared word is not enough", looksAlike(["heinz", "ketchup"], ["heinz", "mayo"]), false);
eq("identical is handled by auto-match, not suggested", looksAlike(["a", "b"], ["a", "b"]), false);
eq("nothing shared", looksAlike(["cola"], ["milk"]), false);

// filters and summary
const all = [...r1.products, same, ...buildProducts([row("Milk Whole 1L", 3.3, "A", "2026-10-01"), row("Milk Whole 1L", 3.1, "A", "2026-11-05")]).products];
eq("filter up", all.filter((x) => matchesFilter(x, "up")).map((x) => x.name), ["Eggs"]);
eq("filter down", all.filter((x) => matchesFilter(x, "down")).map((x) => x.name), ["Milk Whole"]);
eq("filter elsewhere", all.filter((x) => matchesFilter(x, "elsewhere")).map((x) => x.name), ["Corona Extra"]);
eq("summary", priceSummary(all), { up: 1, down: 1, elsewhere: 1, saveTotal: 0.26, stores: 3 });

console.log(fail ? `${fail} FAILED` : "price-compare: all checks passed");
process.exit(fail ? 1 : 0);
