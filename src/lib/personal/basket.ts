/**
 * "Best store for your list": what a shopping list costs at each store you have receipts from, how each store's prices
 * compare with the average store, and how far each store is. Pure functions, no I/O, so they are unit-tested.
 */
import type { Product } from "@/lib/personal/price-compare";

export const STALE_DAYS = 60;
/** A store needs this many products also seen elsewhere before it gets a price level */
export const MIN_SHARED = 5;
export const RADII = [1, 3, 5, 10] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
export const ageDays = (date: string, now: Date) => Math.max(0, Math.round((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86400000));
export const normStore = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(supermarket|supermarkt|super market|mini market|minimarket|market|the|and|n v|nv|b v|bv|sa|inc|ltd|store|shop)\b/g, " ").replace(/\s+/g, " ").trim();

/** Words that start many shop names, so on their own they say nothing */
const GENERIC = new Set(["super", "food", "foods", "mini", "plaza", "fresh", "city", "express", "discount", "cash", "carry"]);

/**
 * How well two store names are the same shop, 0 to 1 (0 = not the same). "LING & SONS SUPERMARKET NV" matches "Ling and Sons",
 * and "SuperFood Plaza" matches "Super Food Plaza". A lone short word never matches a longer name.
 */
export function storeMatch(a: string, b: string): number {
  const x = normStore(a), y = normStore(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const sx = x.replace(/ /g, ""), sy = y.replace(/ /g, "");
  if (sx === sy) return 0.95;
  const tx = x.split(" "), ty = y.split(" ");
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  const shortOk = short.length >= 2 || (short[0].length >= 4 && !GENERIC.has(short[0]));
  if (shortOk && short.every((t) => long.includes(t))) return 0.8;
  const [ss, sl] = sx.length <= sy.length ? [sx, sy] : [sy, sx];
  if (ss.length >= 5 && !GENERIC.has(short.join(" ")) && sl.includes(ss)) return 0.7;
  const common = tx.filter((t) => ty.includes(t)).length;
  const jac = common / new Set([...tx, ...ty]).size;
  return common >= 2 && jac >= 0.6 ? jac * 0.6 : 0;
}
/** Same shop under a slightly different name */
export const sameStore = (a: string, b: string): boolean => storeMatch(a, b) > 0;
/** The receipt store that best matches a place name, or null */
export function bestStoreFor(placeName: string, stores: string[]): string | null {
  let best: string | null = null, score = 0;
  for (const s of stores) { const m = storeMatch(s, placeName); if (m > score) { score = m; best = s; } }
  return best;
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------------- distance ---------------- */

export type LatLng = { lat: number; lng: number };
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ---------------- shopping list ---------------- */

export type UsualItem = { key: string; name: string; size: string | null; count: number; lastDate: string; daysSince: number; /** bought more than a usual gap ago */ due: boolean };

/** Things bought more than once, the ones that are due again first. */
export function usualItems(products: Product[], currency: string, now: Date): UsualItem[] {
  const out: UsualItem[] = [];
  for (const p of products) {
    if (p.currency !== currency || p.count < 2) continue;
    const dates = [...new Set(p.history.map((h) => h.date))].sort();
    if (dates.length < 2) continue;
    const gaps = dates.slice(1).map((d, i) => ageDays(dates[i], new Date(`${d}T00:00:00Z`)));
    const gap = median(gaps);
    const since = ageDays(p.lastDate, now);
    if (since > 180) continue;
    out.push({ key: p.key, name: p.name, size: p.size, count: p.count, lastDate: p.lastDate, daysSince: since, due: gap > 0 && since >= gap });
  }
  return out.sort((a, b) => Number(b.due) - Number(a.due) || b.count - a.count || a.name.localeCompare(b.name));
}

/* ---------------- store price level ---------------- */

export type Level = "cheapest" | "below" | "average" | "above" | "dearest" | "nodata";
export type StoreIndex = { store: string; /** percent against the average store, null when there is not enough data */ pct: number | null; shared: number; level: Level };

const fresh = (date: string, now: Date) => ageDays(date, now) <= STALE_DAYS;

/**
 * Like for like only: a product counts when 2 or more stores have a price under 60 days old. Each store price is divided by
 * the median across stores; a store's score is the average of those ratios weighted by what you spend on the product.
 */
export function storeIndex(products: Product[], currency: string, now: Date): StoreIndex[] {
  const acc = new Map<string, { w: number; wr: number; n: number }>();
  const allStores = new Set<string>();
  for (const p of products) {
    if (p.currency !== currency) continue;
    for (const s of p.stores) allStores.add(s.store);
    const live = p.stores.filter((s) => fresh(s.latest.date, now) && s.latest.price > 0);
    if (live.length < 2) continue;
    const mid = median(live.map((s) => s.latest.price));
    const w = p.totalSpent > 0 ? p.totalSpent : 1;
    for (const s of live) {
      const a = acc.get(s.store) ?? { w: 0, wr: 0, n: 0 };
      a.w += w; a.wr += w * (s.latest.price / mid); a.n += 1;
      acc.set(s.store, a);
    }
  }
  const list: StoreIndex[] = [...allStores].map((store) => {
    const a = acc.get(store);
    if (!a || a.n < MIN_SHARED) return { store, pct: null, shared: a?.n ?? 0, level: "nodata" as Level };
    return { store, pct: round1((a.wr / a.w - 1) * 100), shared: a.n, level: "average" as Level };
  });
  const rated = list.filter((s) => s.pct != null);
  const lo = Math.min(...rated.map((s) => s.pct!)), hi = Math.max(...rated.map((s) => s.pct!));
  for (const s of rated) {
    const p = s.pct!;
    s.level = rated.length >= 2 && p === lo && p <= -3 ? "cheapest" : rated.length >= 2 && p === hi && p >= 3 ? "dearest" : p > 2 ? "above" : p < -2 ? "below" : "average";
  }
  return list.sort((a, b) => (a.pct ?? 99) - (b.pct ?? 99));
}

export const LEVEL_LABEL: Record<Level, string> = { cheapest: "Cheapest", below: "Below average", average: "About average", above: "Above average", dearest: "Most expensive", nodata: "Not enough data" };

/* ---------------- basket ---------------- */

export type ListItem = { key: string; qty: number };
export type PriceSource = "own" | "community" | "online";
export type BasketLine = { key: string; name: string; qty: number; price: number | null; total: number | null; status: "priced" | "old" | "unknown"; date: string | null; source: PriceSource | null };
export type StoreBasket = {
  store: string;
  /** The total of the items that have a real price here (items with no price are left out, never guessed) */
  total: number;
  lines: BasketLine[];
  priced: number;
  old: number;
  /** Items with no real price at this store */
  unknown: number;
  /** Extra against the cheapest store that prices as many items (0 for the cheapest, and when the stores price different numbers of items) */
  extra: number;
  level: Level;
  levelPct: number | null;
};

/** Real prices from outside your receipts: community and online price lists, by store and product key. */
export type ExternalPrice = { store: string; key: string; price: number; source: "community" | "online" };

/**
 * The list at each store, from real prices only: the latest price you paid there (flagged when older than 60 days), otherwise a
 * community or online price list price for the same product. An item with none of these is left out of that store and counted as
 * "no price"; it is never estimated.
 */
export function basketTotals(list: ListItem[], products: Product[], stores: string[], index: StoreIndex[], now: Date, external: ExternalPrice[] = []): StoreBasket[] {
  const byKey = new Map(products.map((p) => [p.key, p]));
  const idx = new Map(index.map((i) => [i.store, i]));
  const out: StoreBasket[] = stores.map((store) => {
    const lines: BasketLine[] = list.flatMap((it) => {
      const p = byKey.get(it.key);
      if (!p) return [];
      const here = p.stores.find((s) => s.store === store);
      if (here) {
        const old = !fresh(here.latest.date, now);
        return [{ key: p.key, name: p.name, qty: it.qty, price: here.latest.price, total: round2(here.latest.price * it.qty), status: old ? "old" : "priced", date: here.latest.date, source: "own" } as BasketLine];
      }
      // community first (people paid it), then the online list; the cheapest of the two sources is not assumed, the community one wins
      const ext = external.filter((e) => e.key === it.key && sameStore(e.store, store) && e.price > 0).sort((a, b) => (a.source === b.source ? a.price - b.price : a.source === "community" ? -1 : 1))[0];
      if (ext) return [{ key: p.key, name: p.name, qty: it.qty, price: ext.price, total: round2(ext.price * it.qty), status: "priced", date: null, source: ext.source } as BasketLine];
      return [{ key: p.key, name: p.name, qty: it.qty, price: null, total: null, status: "unknown", date: null, source: null } as BasketLine];
    });
    const total = round2(lines.reduce((s, l) => s + (l.total ?? 0), 0));
    const i = idx.get(store);
    return {
      store, total, lines,
      priced: lines.filter((l) => l.status === "priced" || l.status === "old").length,
      old: lines.filter((l) => l.status === "old").length,
      unknown: lines.filter((l) => l.status === "unknown").length,
      extra: 0, level: i?.level ?? "nodata", levelPct: i?.pct ?? null,
    };
  });
  // A store that prices more of your list comes first; then the lower total
  out.sort((a, b) => b.priced - a.priced || a.total - b.total);
  const top = out[0];
  if (top) for (const s of out) s.extra = s.priced === top.priced ? round2(s.total - top.total) : 0;
  return out;
}

/** Only worth a second stop when the saving beats the cost of the trip (about 0.35 per km, there and back). */
export function splitAdvice(list: ListItem[], baskets: StoreBasket[], distKm: Map<string, number>, perKm = 0.35): { stores: [string, string]; saving: number } | null {
  if (baskets.length < 2 || !list.length) return null;
  const best = baskets[0];
  // moving each item to its cheapest priced store among the two nearest stores
  const pool = baskets.slice(0, 3);
  let save = 0, second: string | null = null;
  for (const alt of pool.slice(1)) {
    let s = 0;
    for (const l of best.lines) {
      const o = alt.lines.find((x) => x.key === l.key);
      if (l.total != null && o?.status === "priced" && o.total != null && o.total < l.total) s += l.total - o.total;
    }
    if (s > save) { save = s; second = alt.store; }
  }
  if (!second) return null;
  const trip = (distKm.get(second) ?? 0) * 2 * perKm;
  const net = round2(save - trip);
  return net > 0 ? { stores: [best.store, second], saving: net } : null;
}
