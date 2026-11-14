/**
 * Best Prices: one search over three sources, so the cheapest place is easy to see.
 *  - your own receipts (latest price at each store)
 *  - community prices (the middle price 3 or more people reported; works whether or not you share)
 *  - online shop prices Lifolio keeps (store websites and the admin's imported price lists)
 * Pure, so it is unit-tested.
 */
import { groupCommunity, productKey, type CommunityRow } from "@/lib/personal/community";
import { productWords, type Product } from "@/lib/personal/price-compare";
import type { OnlineMatch } from "@/lib/store-prices";

export type OfferSource = "own" | "community" | "online";
export type Offer = { store: string; price: number; source: OfferSource; note: string; best: boolean };
export type PriceGroup = { key: string; name: string; size: string | null; currency: string; offers: Offer[] };

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** Every word typed must be in the product name */
export function nameMatches(q: string, name: string): boolean {
  const want = words(q);
  if (!want.length) return false;
  const have = words(name).join(" ");
  return want.every((w) => have.includes(w));
}

const sameWords = (a: string, b: string) => { const x = [...productWords(a)].sort().join(" "); return x.length > 0 && x === [...productWords(b)].sort().join(" "); };

type Draft = { key: string; name: string; size: string | null; currency: string; offers: Omit<Offer, "best">[] };

export function searchBestPrices(args: { q: string; products: Product[]; community: CommunityRow[]; online: OnlineMatch[]; currency: string }): PriceGroup[] {
  const { q, products, community, online, currency } = args;
  const groups = new Map<string, Draft>();
  const put = (key: string, name: string, size: string | null) => {
    const g = groups.get(key) ?? { key, name, size, currency, offers: [] };
    groups.set(key, g);
    return g;
  };

  for (const p of products) {
    if (p.currency !== currency) continue;
    if (!nameMatches(q, p.name) && !p.names.some((n) => nameMatches(q, n.name))) continue;
    const g = put(productKey(p), p.name, p.size);
    for (const s of p.stores) g.offers.push({ store: s.store, price: s.latest.price, source: "own", note: `Your receipt, ${s.latest.date}` });
  }

  for (const c of groupCommunity(community.filter((r) => r.currency === currency))) {
    const g = put(c.key, c.name, c.size);
    for (const s of c.stores) g.offers.push({ store: s.store, price: s.price, source: "community", note: `Community, ${s.reporters} people` });
  }

  for (const m of online) {
    if (!(m.price > 0)) continue;
    const host = [...groups.values()].find((g) => sameWords(g.name, m.name));
    const g = host ?? put(`online|${m.name}|${m.size ?? ""}`, m.name, m.size);
    g.offers.push({ store: m.storeName, price: m.price, source: "online", note: m.status === "same" ? "Online price list" : "Online price list, similar item" });
  }

  const out: PriceGroup[] = [];
  for (const g of groups.values()) {
    // one line per store and source; the cheapest of two lines from one place
    const seen = new Map<string, Omit<Offer, "best">>();
    for (const o of g.offers) {
      const k = `${o.store.toLowerCase()}|${o.source}`;
      const old = seen.get(k);
      if (!old || o.price < old.price) seen.set(k, o);
    }
    const offers = [...seen.values()].sort((a, b) => a.price - b.price || a.store.localeCompare(b.store));
    if (!offers.length) continue;
    out.push({ ...g, offers: offers.map((o, i) => ({ ...o, best: i === 0 })) });
  }
  return out.sort((a, b) => b.offers.length - a.offers.length || a.name.localeCompare(b.name)).slice(0, 8);
}
