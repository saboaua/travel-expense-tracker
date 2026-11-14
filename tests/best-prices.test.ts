import { nameMatches, searchBestPrices } from "../src/lib/personal/best-prices";
import { buildProducts } from "../src/lib/personal/price-compare";
import { productKey, type CommunityRow } from "../src/lib/personal/community";
import type { TrackerRow } from "../src/lib/personal/grocery";
import type { OnlineMatch } from "../src/lib/store-prices";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const row = (name: string, price: number, store: string, date: string): TrackerRow => ({
  name, normalized_name: name.toLowerCase(), category: "Beverages", unit_price: price, quantity: 1, unit: null, line_total: price * 3,
  receipt: { store, purchase_date: date, currency: "AWG" },
});
const { products } = buildProducts([row("Corona Extra 330ML", 5.99, "Folira Supermarket", "2026-10-30"), row("Corona Extra 330ML", 5.49, "Ling & Sons", "2026-11-13"), row("Oreo 154G", 1.5, "Folira Supermarket", "2026-11-01")]);
const corona = products.find((p) => p.name.toLowerCase().includes("corona"))!;
const com = (store: string, price: number, n = 7): CommunityRow => ({ product_key: productKey(corona), product_name: corona.name, size_label: corona.size, currency: "AWG", store_name: store, price, reporters: n, last_month: "2026-11-01" });
const online = (store: string, price: number): OnlineMatch => ({ store: "superfood", storeName: store, itemId: "1", name: "Corona Extra", size: "330 ml", price, url: null, fetchedAt: "2026-11-10", status: "same", confirmed: false, score: 1 });

eq("words must all match", [nameMatches("corona", "Corona Extra 330ML"), nameMatches("extra corona", "Corona Extra"), nameMatches("fanta", "Corona Extra"), nameMatches("", "x")], [true, true, false, false]);

const g = searchBestPrices({ q: "corona", products, community: [com("New Ten Sing", 5.69), com("Save More", 6.15)], online: [online("Super Food Plaza", 5.79)], currency: "AWG" });
eq("one group", g.length, 1);
eq("all three sources in one list, cheapest first", g[0].offers.map((o) => `${o.store}:${o.price}:${o.source}`), ["Ling & Sons:5.49:own", "New Ten Sing:5.69:community", "Super Food Plaza:5.79:online", "Folira Supermarket:5.99:own", "Save More:6.15:community"]);
eq("only the cheapest is best", g[0].offers.map((o) => o.best), [true, false, false, false, false]);
eq("no match, no group", searchBestPrices({ q: "fanta", products, community: [], online: [], currency: "AWG" }), []);
eq("another currency is not mixed in", searchBestPrices({ q: "corona", products, community: [], online: [], currency: "USD" }), []);
const only = searchBestPrices({ q: "corona", products: [], community: [com("New Ten Sing", 5.69)], online: [], currency: "AWG" });
eq("works with no receipts of your own", only[0]?.offers[0]?.source, "community");
const dup = searchBestPrices({ q: "corona", products: [], community: [com("A", 5), com("A", 4)], online: [], currency: "AWG" });
eq("one line per store and source", dup[0].offers.length, 1);
if (fail) process.exit(1);
console.log("ok best-prices");
