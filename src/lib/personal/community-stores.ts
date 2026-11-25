import { CATEGORIES, asCategory, type CategoryId } from "@/lib/personal/store-categories";

/** What the community has shared, counted per country and per store, for the admin overview. Counts only: nobody is named. */
export type SharedRowLite = { country: string | null; store_key: string; store_name: string; product_key: string; contributor: string; month: string };
export type StoreCount = { storeKey: string; name: string; category: CategoryId; products: number; prices: number; shoppers: number; last: string | null };
export type CategoryCount = { id: CategoryId; stores: number; products: number; list: StoreCount[] };
export type CountryCount = { country: string; products: number; stores: number; shoppers: number; list: StoreCount[]; categories: CategoryCount[] };
/** The category an admin gave a store, by `${country}|${storeKey}`. A store nobody moved is a supermarket. */
export type CategoryMap = ReadonlyMap<string, string>;

/** Rows in, one entry per country: unique products (a product at two stores counts once), stores and shoppers, and a list by store, most products first. */
export function summarizeShared(rows: SharedRowLite[], cats: CategoryMap = new Map()): CountryCount[] {
  type S = { name: string; last: string; products: Set<string>; shoppers: Set<string>; prices: number };
  const by = new Map<string, { products: Set<string>; shoppers: Set<string>; stores: Map<string, S> }>();
  for (const r of rows) {
    const c = (r.country ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(c) || !r.store_key || !r.product_key) continue;
    const g = by.get(c) ?? { products: new Set<string>(), shoppers: new Set<string>(), stores: new Map<string, S>() };
    by.set(c, g);
    g.products.add(r.product_key);
    g.shoppers.add(r.contributor);
    const s = g.stores.get(r.store_key) ?? { name: r.store_name, last: r.month, products: new Set<string>(), shoppers: new Set<string>(), prices: 0 };
    g.stores.set(r.store_key, s);
    s.products.add(r.product_key);
    s.shoppers.add(r.contributor);
    s.prices += 1;
    if (r.month > s.last) { s.last = r.month; s.name = r.store_name; }
  }
  return [...by].map(([country, g]) => {
    const list = [...g.stores].map(([storeKey, s]) => ({ storeKey, name: s.name, category: asCategory(cats.get(`${country}|${storeKey}`)), products: s.products.size, prices: s.prices, shoppers: s.shoppers.size, last: s.last }))
      .sort((a, b) => b.products - a.products || b.prices - a.prices || a.name.localeCompare(b.name));
    // Every category is listed, empty or not, so an admin always sees where a store can go. A product sold in two stores of one category counts once there.
    const categories = CATEGORIES.map((c) => {
      const stores = list.filter((s) => s.category === c.id);
      const keys = new Set(stores.flatMap((s) => [...(g.stores.get(s.storeKey)?.products ?? [])]));
      return { id: c.id, stores: stores.length, products: keys.size, list: stores };
    });
    return { country, products: g.products.size, stores: g.stores.size, shoppers: g.shoppers.size, list, categories };
  }).sort((a, b) => a.country.localeCompare(b.country));
}
