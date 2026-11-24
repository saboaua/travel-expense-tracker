import { summarizeShared } from "../src/lib/personal/community-stores";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); process.exit(1); } };
const r = (country: string | null, sk: string, sn: string, pk: string, who: string, month = "2026-11-01") => ({ country, store_key: sk, store_name: sn, product_key: pk, contributor: who, month });
const out = summarizeShared([
  r("AW", "ling", "Ling & Sons", "milk", "a"), r("AW", "ling", "Ling & Sons", "eggs", "a"), r("AW", "ling", "Ling & Sons", "milk", "b", "2026-10-01"),
  r("AW", "sf", "Super Food", "milk", "b"), r("AW", "sf", "Super Food", "rice", "c"), r("AW", "sf", "Super Food", "eggs", "c"),
  r("SR", "x", "Hermes", "milk", "d"), r(null, "y", "Nowhere", "milk", "e"), r("aw", "", "No key", "milk", "f"),
]);
eq(out.map((c) => c.country), ["AW", "SR"], "rows with no country or no store are left out");
const aw = out[0];
eq([aw.products, aw.stores, aw.shoppers], [3, 2, 3], "a product at two stores counts once in the total");
eq(aw.list.map((s) => [s.name, s.products, s.prices, s.shoppers, s.last]), [["Super Food", 3, 3, 2, "2026-11-01"], ["Ling & Sons", 2, 3, 2, "2026-11-01"]], "per store, most products first");
eq(out[1].list.length, 1, "other countries are kept apart");
console.log("community stores ok");
