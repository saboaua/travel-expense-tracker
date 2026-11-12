import { doitSize, mapDoit, staleDays, compareOnline, fetchLing, fetchSuperFood, mapFreshop, mapShopify, matchProducts, scoreCandidate, tidySize, type CatalogItem } from "../src/lib/store-prices";
import { parseSize, productWords } from "../src/lib/personal/price-compare";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

// the shops' size words
eq([tidySize("500 gram"), tidySize("1 liter"), tidySize("each"), tidySize(undefined), tidySize("12 count")], ["500 g", "1 l", null, null, "12 ct"], "size words are tidied");

// Super Food Plaza (Freshop) rows, as the shop sends them
const fresh = [
  { id: "1764405684716035717", name: "JUMBO KRIELTJES MIX", unit_price: 4.95, size: "500 gram", status: "available", canonical_url: "https://shop.superfoodaruba.com/shop/produce/jumbo_krieltjes_mix/p/1764405684716035717" },
  { id: "1564405684716386181", name: "CUCUMBER SEEDLESS", unit_price: 5.59, size: "each", status: "available" },
  { id: "x1", name: "NO PRICE", status: "available" },
  { id: "x2", name: "GONE", unit_price: 3, status: "unavailable" },
];
const f = mapFreshop(fresh);
eq(f.map((r) => [r.item_id, r.price, r.size_text]), [["1764405684716035717", 4.95, "500 g"], ["1564405684716386181", 5.59, null]], "Freshop: price and size read; no price or unavailable left out");
eq(f[0].name_norm, "jumbo krieltjes mix 500 g", "Freshop: search text");

// Ling & Sons (Shopify) rows
const ling = mapShopify([
  { title: "A&W Rootbeer 12-pack 12 oz", handle: "502000025912", variants: [{ price: "16.14" }] },
  { title: "Abbazia Moscato 75 cl", handle: "502000038229", variants: [{ price: "18.75" }] },
  { title: "Soda", handle: "soda", variants: [{ id: 1, title: "Small", price: "2.00" }, { id: 2, title: "Large", price: "3.00" }] },
  { title: "13\" BBQ Grill", handle: "13-bbq-grill", variants: [{ price: "0" }] },
]);
eq(ling.map((r) => [r.item_id, r.name, r.price]), [["502000025912", "A&W Rootbeer 12-pack 12 oz", 16.14], ["502000038229", "Abbazia Moscato 75 cl", 18.75], ["soda#1", "Soda Small", 2], ["soda#2", "Soda Large", 3]], "Shopify: one row per variant, zero prices left out");
eq(ling[0].url, "https://shop.lingandsons.com/products/502000025912", "Shopify: link to the product");

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
async function readers() {
// reading the lists page by page (fake shops)
{
  const calls: string[] = [];
  const pages = [[{ id: "a", name: "A", unit_price: 1 }, { id: "b", name: "B", unit_price: 2 }], [{ id: "c", name: "C", unit_price: 3 }]];
  const fake = (async (u: string | URL | Request) => { const url = String(u); calls.push(url); const skip = Number(/skip=(\d+)/.exec(url)![1]); return json({ total: 3, items: skip === 0 ? pages[0] : skip === 2 ? pages[1] : [] }); }) as typeof fetch;
  const r = await fetchSuperFood(fake, { pageSize: 2, pauseMs: 0 });
  eq([r.rows.map((x) => x.item_id), r.complete, calls.length], [["a", "b", "c"], true, 2], "Super Food: reads every page, stops at the total");
  eq(/limit=2&skip=2&offset=2/.test(calls[1]), true, "Super Food: asks for the next page with skip");
  const same = (async () => json({ total: 99, items: [{ id: "a", name: "A", unit_price: 1 }, { id: "b", name: "B", unit_price: 2 }] })) as typeof fetch;
  const loop = await fetchSuperFood(same, { pageSize: 2, pauseMs: 0 });
  eq([loop.rows.length, loop.complete], [2, false], "Super Food: a shop that ignores skip does not loop, the read is marked short");
  let bad = ""; try { await fetchSuperFood((async () => new Response("no", { status: 500 })) as typeof fetch, { pauseMs: 0 }); } catch (e) { bad = (e as Error).message; }
  eq(bad, "HTTP 500", "Super Food: a failing shop raises an error");
}
{
  const fake = (async (u: string | URL | Request) => { const page = Number(/page=(\d+)/.exec(String(u))![1]); return json({ products: page === 1 ? [{ title: "X 1 L", handle: "x", variants: [{ price: "2" }] }, { title: "Y", handle: "y", variants: [{ price: "3" }] }] : page === 2 ? [{ title: "Z", handle: "z", variants: [{ price: "4" }] }] : [] }); }) as typeof fetch;
  const r = await fetchLing(fake, { pageSize: 2, pauseMs: 0 });
  eq([r.rows.map((x) => x.item_id), r.complete], [["x", "y", "z"], true], "Ling: reads pages until a short one");
}

}

// does their product fit what you bought?
const want = (name: string) => ({ words: productWords(name), size: parseSize(name) });
eq(scoreCandidate(want("Coca Cola Zero Sugar 500ml"), { name: "COCA COLA ZERO SUGAR BOTTLE", size_text: "500 ml" })?.status, "same", "same words, same size: same product");
eq(scoreCandidate(want("Coca Cola Zero Sugar 500ml"), { name: "COCA COLA ZERO SUGAR BOTTLE", size_text: "1.5 l" }), null, "a different size is never offered");
eq(scoreCandidate(want("Corona Extra Bot 33CL"), { name: "Corona Extra 330 ml", size_text: null })?.status, "same", "33 cl is 330 ml, and 'Bot' is ignored");
eq(scoreCandidate(want("Lays Sour Cream 170 g"), { name: "FRITO LAY SOUR CREAM ONION", size_text: "170 g" })?.status, "ask", "a brand prefix and extra words: ask");
eq(scoreCandidate(want("Milk Whole 1L"), { name: "Chocolate Bar", size_text: "1 l" }), null, "unrelated: no");
eq(scoreCandidate(want("Eggs 12 ct"), { name: "Eggs Large Brown", size_text: null }) === null, false, "a pack count with no size on their side can still be offered");

// finding the best product per shop
const cat = (store: "superfood" | "ling", item_id: string, name: string, price: number, size_text: string | null = null): CatalogItem => ({ store, item_id, name, size_text, price, url: null, fetched_at: "2026-11-12T08:40:00Z" });
const catalog = [
  cat("superfood", "s1", "COCA COLA ZERO SUGAR BOTTLE", 2.5, "500 ml"),
  cat("superfood", "s2", "COCA COLA ZERO SUGAR BOTTLE", 4.2, "1.5 l"),
  cat("ling", "l1", "Coca Cola Zero 500 ml", 2.3),
  cat("ling", "l2", "Coca Cola Zero Sugar 500 ml", 2.9),
  cat("ling", "l3", "Heineken 6-pack", 9),
];
const wanted = [{ key: "AWG|coca cola zero|v500|", names: ["Coca Cola Zero Sugar 500ml"] }];
let m = matchProducts(wanted, catalog)[wanted[0].key];
eq(m.map((x) => [x.store, x.itemId, x.status]), [["superfood", "s1", "same"], ["ling", "l2", "same"]], "one best product per shop; the other size is left out");
eq(m.map((x) => x.price), [2.5, 2.9], "sorted cheapest first");
m = matchProducts(wanted, catalog, [{ product_key: wanted[0].key, store: "ling", item_id: "l2", same: false }])[wanted[0].key];
eq(m.map((x) => [x.store, x.itemId]), [["ling", "l1"], ["superfood", "s1"]], "a No removes that product, the next best is offered");
m = matchProducts(wanted, catalog, [{ product_key: wanted[0].key, store: "ling", item_id: "l3", same: true }])[wanted[0].key];
eq(m.find((x) => x.store === "ling")?.itemId, "l3", "a Yes is always used, and marked confirmed");
eq(m.find((x) => x.store === "ling")?.confirmed, true, "confirmed flag");
eq(Object.keys(matchProducts(wanted, catalog, [], ["ling"])).length === 1 && matchProducts(wanted, catalog, [], ["ling"])[wanted[0].key].length, 1, "a shop switched off is not used");
eq(matchProducts([{ key: "k", names: ["Truffle Oil 250 ml"] }], catalog), {}, "nothing found: no entry");

// what the card says
const same = (price: number, status: "same" | "ask" = "same") => ({ store: "superfood" as const, storeName: "Super Food Plaza", itemId: "i", name: "n", size: null, price, url: null, fetchedAt: "", status, confirmed: false, score: 1 });
const v1 = compareOnline(5.49, [same(4.95)]);
eq([v1.cheaper?.price, v1.savingAmount, v1.savingPct], [4.95, 0.54, 9.8], "cheaper online: amount and percent");
const v2 = compareOnline(3.1, [same(3.35)]);
eq([v2.cheaper, v2.dearer?.price, v2.extraPct], [null, 3.35, 8.1], "dearer online: how much more");
eq(compareOnline(5, [same(1, "ask")]).cheaper, null, "an unsure match never counts as cheaper");

readers().then(() => {
  
// ---- Do it Aruba file import ----
eq([doitSize("COKE ZERO 40OZ"), doitSize("DOVE SOAP 350GR /13 OZ"), doitSize("MILK 1.5 LT"), doitSize("BANANA")], ["40 oz", "350 g", "1.5 l", null], "doit sizes are read from the description");
const dbase = { LSC_Unit_Price_Incl_VAT: 2.5, ProductStatus: "All", ShowonWebsite: true, Blocked: false };
const dr = mapDoit([
  { ...dbase, No: "111", Description: "COKE\tZERO   40OZ" },
  { ...dbase, No: "112", Description: "SOLD", ProductStatus: "Soldout" },
  { ...dbase, No: "113", Description: "CLOSE", ProductStatus: "Closeout" },
  { ...dbase, No: "114", Description: "HIDDEN", ShowonWebsite: false },
  { ...dbase, No: "115", Description: "BLOCKED", Blocked: true },
  { ...dbase, No: "116", Description: "FREE", LSC_Unit_Price_Incl_VAT: 0 },
  { ...dbase, No: "", Description: "NOID" },
  { ...dbase, No: "111", Description: "COKE ZERO 40OZ" },
]);
eq([dr.total, dr.rows.length, dr.skipped], [8, 1, { soldOut: 1, closeout: 1, hidden: 2, noPrice: 1, noName: 1 }], "doit rows: skips and counts");
eq([dr.rows[0].name, dr.rows[0].store, dr.rows[0].size_text], ["COKE ZERO 40OZ", "doit", "40 oz"], "doit row is cleaned");
eq(mapDoit([{ ...dbase, No: "1", Description: "X", ProductStatus: "Closeout" }], { closeout: true }).rows.length, 1, "closeout can be kept");
eq(staleDays("doit") > staleDays("superfood"), true, "file prices stay usable longer");
const dcat = mapDoit([{ ...dbase, No: "9", Description: "COCA COLA ZERO 40OZ", LSC_Unit_Price_Incl_VAT: 3.1 }]).rows.map((x) => ({ ...x, fetched_at: new Date().toISOString() }));
const dm = matchProducts([{ key: "k", names: ["Coca Cola Zero 40 oz"] }], dcat as never, [], ["doit"]);
eq(dm.k?.[0]?.status, "same", "a bought 40 oz matches the file's 40OZ");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
  console.log("store-prices: all checks passed");
});
