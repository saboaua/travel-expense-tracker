/**
 * Best Prices: one search over three sources, so the cheapest place is easy to see.
 *  - your own receipts (latest price at each store)
 *  - community prices (the middle price shoppers paid, from the first shopper; Confirmed from 3; works whether or not you share).
 *    The admin's imported Excel price lists are in here too: each upload counts as one more shopper.
 *  - online shop prices Lifolio keeps (the daily copy of the online supermarkets' own lists)
 * Pure, so it is unit-tested.
 */
import { groupCommunity, productKey, shopperLabel, type CommunityRow } from "@/lib/personal/community";
import { productWords, type Product } from "@/lib/personal/price-compare";
import type { OnlineMatch } from "@/lib/store-prices";
import type { ExternalPrice } from "@/lib/personal/basket";

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
    for (const s of p.stores) g.offers.push({ store: s.store, price: s.latest.price, source: "own", note: `${s.latest.noted ? "Price you noted" : "Your receipt"}, ${s.latest.date}` });
  }

  for (const c of groupCommunity(community.filter((r) => r.currency === currency))) {
    const g = put(c.key, c.name, c.size);
    for (const s of c.stores) g.offers.push({ store: s.store, price: s.price, source: "community", note: `Community, ${shopperLabel(s.reporters, s.confirmed).toLowerCase()}` });
  }

  for (const m of online) {
    if (!(m.price > 0)) continue;
    const host = [...groups.values()].find((g) => sameWords(g.name, m.name));
    const g = host ?? put(`online|${m.name}|${m.size ?? ""}`, m.name, m.size);
    g.offers.push({ store: m.storeName, price: m.price, source: "online", note: m.ai ? "Online price list, checked automatically" : m.status === "same" ? "Online price list" : "Online price list, similar item" });
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

/**
 * Community and online prices for the products on a list, as real prices to fill the gaps in the basket totals. Community rows are only
 * ones the database returns (the last 3 months, from one shopper up); online matches too, those that are only a similar item flagged so the list says so.
 */
export function externalPrices(community: CommunityRow[], online: Record<string, OnlineMatch[]>, currency: string): ExternalPrice[] {
  const out: ExternalPrice[] = [];
  for (const r of community) if (r.currency === currency && Number(r.price) > 0) out.push({ store: r.store_name, key: r.product_key, price: Number(r.price), source: "community", date: r.last_month ?? null });
  for (const [key, list] of Object.entries(online)) for (const m of list) if (m.price > 0) out.push({ store: m.storeName, key, price: m.price, source: "online", similar: m.status !== "same" });
  return out;
}
