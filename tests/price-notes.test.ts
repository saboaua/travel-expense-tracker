import { checkToTracker, currencyForStore, isSpending, itemName, knownStores, onlySpending, recentProducts, type PriceCheck } from "../src/lib/personal/price-notes";
import { buildProducts } from "../src/lib/personal/price-compare";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq([isSpending({}), isSpending({ prices_only: false }), isSpending({ prices_only: null }), isSpending({ prices_only: true })], [true, true, true, false], "only a receipt marked prices-only is left out of spending");
const res = onlySpending<{ total: number; prices_only?: boolean }>({ data: [{ total: 5 }, { total: 9, prices_only: true }, { total: 3, prices_only: false }], error: null });
eq(res.data?.map((r) => r.total), [5, 3], "prices-only receipts are filtered out of a result");
eq(onlySpending({ data: null, error: { message: "x" } }).data, null, "an error result keeps no rows");

const recs = [
  { store: "One2Three Color Market", currency: "AWG", purchase_date: "2026-11-12" },
  { store: "Plaza Market", currency: "USD", purchase_date: "2026-11-01" },
  { store: "plaza  market", currency: "AWG", purchase_date: "2026-11-09" },
];
eq([currencyForStore(recs, "one2three color market"), currencyForStore(recs, " Plaza Market "), currencyForStore(recs, "New shop"), currencyForStore(recs, "")], ["AWG", "AWG", null, null], "a store's currency is remembered from its latest receipt, ignoring case and spaces");
eq([itemName("", 1), itemName("  ", 3), itemName(" Milk ", 2)], ["Item 1", "Item 3", "Milk"], "unnamed lines become Item N");

const check = (id: string, product: string, store: string, price: number, size: string | null, seen: string, currency = "AWG"): PriceCheck => ({ id, product, store, price, currency, size, seen_on: seen });
eq(checkToTracker(check("1", "C4 Energy", "Fit Stop", 39.95, "30 servings", "2026-11-12")).name, "C4 Energy 30 servings", "the size goes into the name");
eq(checkToTracker(check("1", "C4 Energy", " Fit Stop ", 39.949, null, "2026-11-12")), { name: "C4 Energy", normalized_name: checkToTracker(check("1", "C4 Energy", "x", 1, null, "2026-11-12")).normalized_name, category: "Other", unit_price: 39.95, quantity: 1, unit: null, line_total: 39.95, receipt: { store: "Fit Stop", purchase_date: "2026-11-12", currency: "AWG" } }, "a price check is shaped like a receipt line");

// Three shops for the same product show up as one product with three stores, cheapest first
const rows = [
  check("1", "C4 Energy", "Vitamin Corner", 42.5, "30 servings", "2026-11-10"),
  check("2", "C4 Energy", "Fit Stop", 39.95, "30 servings", "2026-11-12"),
  check("3", "C4 Energy", "Island Health", 48.5, "30 servings", "2026-11-03"),
].map(checkToTracker);
const { products } = buildProducts(rows);
const c4 = products.find((p) => /C4/i.test(p.name));
eq(c4?.stores.map((s) => s.store), ["Fit Stop", "Vitamin Corner", "Island Health"], "the tracker lists the stores cheapest first");
eq(c4?.stores.length, 3, "one product, three stores");

eq(recentProducts([check("1", "C4", "A", 1, null, "2026-11-01"), check("2", "c4", "B", 1, null, "2026-11-02"), check("3", "Whey", "A", 1, null, "2026-11-05"), check("4", "", "A", 1, null, "2026-11-05")]), ["C4", "Whey"], "recent products, most checked first, blanks ignored");
eq(knownStores(["Fit Stop", "fit  stop", "Island Health", " "]), ["Fit Stop", "Island Health"], "known stores merge by name");
process.exit(failed ? 1 : 0);
