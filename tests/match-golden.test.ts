import { matchProducts, searchCatalog, type CatalogItem, type StoreId } from "../src/lib/store-prices";

/**
 * A fixed set of "what you bought / typed" against how the shops write the product. Each case says the product that must be among the
 * results. When a real miss is found (the admin's miss log, or a No/Yes you gave), add its pair here so it stays fixed.
 */
let failed = 0, total = 0, top5 = 0;
const at = new Date().toISOString();
let n = 0;
const item = (store: StoreId, name: string, size: string | null, price = 3): CatalogItem => ({ store, item_id: `i${++n}`, name, size_text: size, price, url: null, fetched_at: at });

const doit = [
  item("doit", "SMART FOOD POPCORN WHITE CHEDDAR 6.75OZ", "6.75 oz"),
  item("doit", "SMARTFOOD POPCORN 2OZ", "2 oz"),
  item("doit", "COCA COLA ZERO 40OZ", "40 oz"),
  item("doit", "LAYS SOUR CREAM & ONION 8OZ", "8 oz"),
  item("doit", "OREO COOKIES 14.3OZ", "14.3 oz"),
  item("doit", "HEINZ KETCHUP 20OZ", "20 oz"),
  item("doit", "PRINGLES ORIGINAL 5.5OZ", "5.5 oz"),
  item("doit", "DOVE BODY WASH 22OZ", "22 oz"),
];
const sf = [
  item("superfood", "Smartfood White Cheddar Popcorn", "6.75 oz"),
  item("superfood", "Coca-Cola Zero Sugar", "2 l"),
  item("superfood", "Lay's Sour Cream and Onion Potato Chips", "184 g"),
  item("superfood", "Oreo Chocolate Sandwich Cookie", "403 g"),
  item("superfood", "Heinz Tomato Ketchup", "567 g"),
  item("superfood", "Pringles Original Potato Crisps", "158 g"),
];
const ling = [item("ling", "Smart Food Popcorn Cheddar 190g", null), item("ling", "Oreo Cookies 14.3 oz", null), item("ling", "Heinz Ketchup 20 oz", null)];
const all = [...doit, ...sf, ...ling];

const cases: { q: string; must: string[] }[] = [
  { q: "smartfood popcorn", must: ["SMART FOOD POPCORN WHITE CHEDDAR 6.75OZ", "SMARTFOOD POPCORN 2OZ", "Smartfood White Cheddar Popcorn", "Smart Food Popcorn Cheddar 190g"] },
  { q: "smart food popcorn", must: ["SMARTFOOD POPCORN 2OZ", "Smartfood White Cheddar Popcorn"] },
  { q: "smartfod popcorn", must: ["Smartfood White Cheddar Popcorn"] },
  { q: "popcorn smartfood 190g", must: ["Smart Food Popcorn Cheddar 190g", "SMART FOOD POPCORN WHITE CHEDDAR 6.75OZ"] },
  { q: "lays sour cream", must: ["LAYS SOUR CREAM & ONION 8OZ", "Lay's Sour Cream and Onion Potato Chips"] },
  { q: "oreo cookie", must: ["OREO COOKIES 14.3OZ", "Oreo Chocolate Sandwich Cookie", "Oreo Cookies 14.3 oz"] },
  { q: "ketchup heinz", must: ["HEINZ KETCHUP 20OZ", "Heinz Tomato Ketchup", "Heinz Ketchup 20 oz"] },
  { q: "pringle", must: ["PRINGLES ORIGINAL 5.5OZ", "Pringles Original Potato Crisps"] },
  { q: "coca cola zero", must: ["COCA COLA ZERO 40OZ", "Coca-Cola Zero Sugar"] },
];
for (const c of cases) {
  total++;
  const got = searchCatalog(c.q, all, ["doit", "superfood", "ling"]).map((x) => x.name);
  const missing = c.must.filter((m) => !got.includes(m));
  if (missing.length) { failed++; console.log(`FAIL search "${c.q}" missed: ${missing.join(" | ")}`); } else top5++;
}

// A bought name, as a receipt writes it, must meet the shop's product (offered at least)
const bought: { name: string; store: StoreId; must: string }[] = [
  { name: "Smartfood popcorn", store: "doit", must: "SMARTFOOD POPCORN 2OZ" },
  { name: "SMARTFOOD WHITE CHEDDAR POPCORN 6.75 OZ", store: "superfood", must: "Smartfood White Cheddar Popcorn" },
  { name: "Lays Sour Cream & Onion 184g", store: "superfood", must: "Lay's Sour Cream and Onion Potato Chips" },
  { name: "Oreo Cookies", store: "superfood", must: "Oreo Chocolate Sandwich Cookie" },
  { name: "Heinz Ketchup 20 oz", store: "doit", must: "HEINZ KETCHUP 20OZ" },
  { name: "Heinz Ketchup 567g", store: "doit", must: "HEINZ KETCHUP 20OZ" }, // 20 oz is 567 g
];
for (const b of bought) {
  total++;
  const m = matchProducts([{ key: "k", names: [b.name] }], all, [], [b.store]).k ?? [];
  if (m.some((x) => x.name === b.must)) top5++; else { failed++; console.log(`FAIL bought "${b.name}" did not meet ${b.must} (got ${m.map((x) => x.name).join(" | ") || "nothing"})`); }
}

console.log(`match-golden: ${top5} of ${total} found`);
if (failed) process.exit(1);
