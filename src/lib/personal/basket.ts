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
export const normStore = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(supermarket|supermarkt|super market|mini market|minimarket|the|n v|nv|bv|b v)\b/g, " ").replace(/\s+/g, " ").trim();
/** Same shop under a slightly different name ("Ling & Sons" and "Ling and Sons Supermarket") */
export function sameStore(a: string, b: string): boolean {
  const x = normStore(a.replace(/&/g, " and ")), y = normStore(b.replace(/&/g, " and "));
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
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
export type BasketLine = { key: string; name: string; qty: number; price: number | null; total: number | null; status: "priced" | "old" | "estimated" | "unknown"; date: string | null };
export type StoreBasket = {
  store: string;
  total: number;
  lines: BasketLine[];
  priced: number;
  estimated: number;
  old: number;
  unknown: number;
  /** Extra against the cheapest store (0 for the cheapest) */
  extra: number;
  level: Level;
  levelPct: number | null;
};

/**
 * The list at each store: the latest price you paid there (flagged when older than 60 days); an item never bought there is
 * estimated as the middle price across stores, moved by that store's price level, and says so.
 */
export function basketTotals(list: ListItem[], products: Product[], stores: string[], index: StoreIndex[], now: Date): StoreBasket[] {
  const byKey = new Map(products.map((p) => [p.key, p]));
  const idx = new Map(index.map((i) => [i.store, i]));
  const out: StoreBasket[] = stores.map((store) => {
    const lines: BasketLine[] = list.flatMap((it) => {
      const p = byKey.get(it.key);
      if (!p) return [];
      const here = p.stores.find((s) => s.store === store);
      if (here) {
        const old = !fresh(here.latest.date, now);
        return [{ key: p.key, name: p.name, qty: it.qty, price: here.latest.price, total: round2(here.latest.price * it.qty), status: old ? "old" : "priced", date: here.latest.date } as BasketLine];
      }
      const ref = median(p.stores.map((s) => s.latest.price));
      const pct = idx.get(store)?.pct ?? 0;
      if (!(ref > 0)) return [{ key: p.key, name: p.name, qty: it.qty, price: null, total: null, status: "unknown", date: null } as BasketLine];
      const est = round2(ref * (1 + pct / 100));
      return [{ key: p.key, name: p.name, qty: it.qty, price: est, total: round2(est * it.qty), status: "estimated", date: null } as BasketLine];
    });
    const total = round2(lines.reduce((s, l) => s + (l.total ?? 0), 0));
    const i = idx.get(store);
    return {
      store, total, lines,
      priced: lines.filter((l) => l.status === "priced" || l.status === "old").length,
      estimated: lines.filter((l) => l.status === "estimated").length,
      old: lines.filter((l) => l.status === "old").length,
      unknown: lines.filter((l) => l.status === "unknown").length,
      extra: 0, level: i?.level ?? "nodata", levelPct: i?.pct ?? null,
    };
  });
  out.sort((a, b) => a.total - b.total);
  const best = out[0]?.total ?? 0;
  for (const s of out) s.extra = round2(s.total - best);
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
      if (l.total != null && o?.status === "priced" && o.total != null && l.status !== "estimated" && o.total < l.total) s += l.total - o.total;
    }
    if (s > save) { save = s; second = alt.store; }
  }
  if (!second) return null;
  const trip = (distKm.get(second) ?? 0) * 2 * perKm;
  const net = round2(save - trip);
  return net > 0 ? { stores: [best.store, second], saving: net } : null;
}
