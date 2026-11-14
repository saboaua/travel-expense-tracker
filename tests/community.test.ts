import { groupCommunity, productKey, sharedRows, SHARED_FIELDS, storeKey } from "../src/lib/personal/community";
import { buildProducts } from "../src/lib/personal/price-compare";
import type { TrackerRow } from "../src/lib/personal/grocery";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const NOW = new Date("2026-11-10T12:00:00Z");
const row = (name: string, price: number, store: string, date: string): TrackerRow => ({
  name, normalized_name: name.toLowerCase(), category: "Beverages", unit_price: price, quantity: 1, unit: null, line_total: price * 3,
  receipt: { store, purchase_date: date, currency: "AWG" },
});

const { products } = buildProducts([
  row("Coca-Cola 330ML", 1.45, "Ling & Sons", "2026-11-03"),
  row("COCA COLA 33CL", 1.59, "New Ten Sing", "2026-10-20"),
  row("Old Item 1L", 5, "Ling & Sons", "2026-05-01"),
]);
const rows = sharedRows(products, NOW);

eq("old prices are not shared", rows.some((r) => r.product_name.startsWith("Old")), false);
eq("one row per product and store", rows.length, 2);
// privacy: nothing but the allowed fields leaves the phone
for (const r of rows) eq("only the allowed fields", Object.keys(r).sort(), [...SHARED_FIELDS].sort());
eq("the date is rounded to the month", rows.map((r) => r.month).sort(), ["2026-10-01", "2026-11-01"]);
eq("no time or day in the data", JSON.stringify(rows).includes("T12:00"), false);
eq("no receipt or account fields", /receipt|user|email|total|quantity|id"/.test(JSON.stringify(rows)), false);
eq("the same product has one key however it is printed", new Set(rows.map((r) => r.product_key)).size, 1);
eq("store keys ignore spacing and company words", storeKey("LING & SONS SUPERMARKET N.V."), storeKey("Ling and Sons"));
eq("product key", productKey({ name: "Coca Cola", size: "330 ml", currency: "AWG", unit: null }), "AWG|coca cola|330 ml|");

const g = groupCommunity([
  { product_key: "k", product_name: "Coca Cola", size_label: "330 ml", currency: "AWG", store_name: "New Ten Sing", price: 1.59, reporters: 7, last_month: "2026-11-01" },
  { product_key: "k", product_name: "Coca Cola", size_label: "330 ml", currency: "AWG", store_name: "Ling & Sons", price: 1.45, reporters: 12, last_month: "2026-11-01" },
]);
eq("cheapest first and marked", g[0].stores.map((s) => [s.store, s.lowest]), [["Ling & Sons", true], ["New Ten Sing", false]]);
eq("one store alone is not called the lowest", groupCommunity([{ product_key: "k", product_name: "X", size_label: null, currency: "AWG", store_name: "A", price: 1, reporters: 3, last_month: "2026-11-01" }])[0].stores[0].lowest, false);

if (fail) process.exit(1);
console.log("PASS community");
