/**
 * Smart Cart (Pro): your usual cart from your own buying habits, and where it costs least. Pure functions, no I/O, unit-tested.
 * It reuses the price rules of "Best Prices" (basket.ts): only real prices count (your receipt, a community price or an online list),
 * an item with no real price at a store is left out of that store and never guessed.
 */
import type { Product } from "@/lib/personal/price-compare";
import { ageDays, basketTotals, distanceKm, sameStore, storeIndex, type BasketLine, type ExternalPrice, type LatLng, type ListItem, type StoreBasket } from "@/lib/personal/basket";

const round2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Roads are longer than a straight line; 1.3 is the usual allowance for town driving. */
export const ROAD_FACTOR = 1.3;
/** A cart needs this many purchases (and 3 usual items) before it is worth planning */
export const LEARN_PURCHASES = 10;
export const MAX_CART = 20;

/* ---------------- settings ---------------- */

export type SmartSettings = {
  /** On: savings are after the cost of driving, and extra stops only show when worth it. Off: every supermarket is listed and the person decides. */
  includeDriving: boolean;
  /** Cost of driving one km (fuel and wear), in the person's currency */
  perKm: number;
  /** Smallest extra saving that makes another stop worth suggesting */
  minSaving: number;
  maxKm: number;
  maxStops: 1 | 2 | 3;
  useOwn: boolean;
  useCommunity: boolean;
  useOnline: boolean;
  /** Count prices older than 60 days (they are flagged) */
  useOld: boolean;
};
export const DEFAULT_SETTINGS: SmartSettings = { includeDriving: true, perKm: 0.35, minSaving: 5, maxKm: 10, maxStops: 3, useOwn: true, useCommunity: true, useOnline: true, useOld: true };

const num = (v: unknown, lo: number, hi: number, d: number) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
/** Whatever was saved on the phone, made safe: wrong types and silly numbers fall back to the defaults. */
export function sanitizeSettings(raw: unknown): SmartSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const stops = Math.round(num(o.maxStops, 1, 3, d.maxStops)) as 1 | 2 | 3;
  return {
    includeDriving: bool(o.includeDriving, d.includeDriving),
    perKm: round2(num(o.perKm, 0, 20, d.perKm)),
    minSaving: round2(num(o.minSaving, 0, 1000, d.minSaving)),
    maxKm: num(o.maxKm, 1, 100, d.maxKm),
    maxStops: stops,
    useOwn: bool(o.useOwn, d.useOwn), useCommunity: bool(o.useCommunity, d.useCommunity), useOnline: bool(o.useOnline, d.useOnline), useOld: bool(o.useOld, d.useOld),
  };
}

/* ---------------- your usual cart ---------------- */

export type HabitItem = { key: string; name: string; size: string | null; count: number; /** typical days between purchases */ everyDays: number | null; /** what you usually buy at once */ qty: number; lastDate: string };

/** What you buy again and again: bought on 2 or more days, within the last 6 months, most often first. */
export function habitItems(products: Product[], currency: string, now: Date, max = MAX_CART): HabitItem[] {
  const out: HabitItem[] = [];
  for (const p of products) {
    if (p.currency !== currency || p.count < 2) continue;
    const dates = [...new Set(p.history.map((h) => h.date))].sort();
    if (dates.length < 2) continue;
    if (ageDays(p.lastDate, now) > 180) continue;
    const gaps = dates.slice(1).map((d, i) => ageDays(dates[i], new Date(`${d}T00:00:00Z`)));
    const gap = Math.round(median(gaps));
    const qty = Math.min(10, Math.max(1, Math.round(median(p.history.map((h) => (h.qty > 0 ? h.qty : 1))))));
    out.push({ key: p.key, name: p.name, size: p.size, count: p.count, everyDays: gap > 0 ? gap : null, qty, lastDate: p.lastDate });
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, max);
}

/** "Every 6 days", "Every 3 weeks", "Every 2 months" */
export function everyText(days: number | null): string {
  if (!days) return "Bought a few times";
  if (days < 14) return `Every ${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `Every ${Math.round(days / 7)} weeks`;
  return `Every ${Math.round(days / 30)} months`;
}

/** How far along the cart is: it needs about 10 purchases of things you buy again. */
export function learning(products: Product[], currency: string, now: Date): { purchases: number; needed: number; ready: boolean; items: number } {
  const purchases = products.filter((p) => p.currency === currency).reduce((s, p) => s + p.count, 0);
  const items = habitItems(products, currency, now).length;
  return { purchases, needed: LEARN_PURCHASES, ready: items >= 3 && purchases >= LEARN_PURCHASES, items };
}

/** The store where you buy this cart most often, from your own receipts (the one every comparison is against). */
export function usualStore(items: ListItem[], products: Product[]): string | null {
  const byKey = new Map(products.map((p) => [p.key, p]));
  const n = new Map<string, number>();
  for (const it of items) for (const s of byKey.get(it.key)?.stores ?? []) n.set(s.store, (n.get(s.store) ?? 0) + s.count);
  let best: string | null = null, top = 0;
  for (const [s, c] of n) if (c > top) { top = c; best = s; }
  return best;
}

/* ---------------- prices at each store ---------------- */

export function smartBaskets(items: ListItem[], products: Product[], stores: string[], now: Date, external: ExternalPrice[], s: SmartSettings, currency: string): StoreBasket[] {
  const index = storeIndex(products, currency, now);
  const own = s.useOwn ? products : products.map((p) => ({ ...p, stores: [] }));
  const ext = external.filter((e) => (e.source === "community" ? s.useCommunity : s.useOnline));
  return basketTotals(items, own, stores, index, now, ext);
}

/** The real price of a cart line at a store, or null (no price, or an old one the person chose not to count). */
function priced(b: StoreBasket, key: string, useOld: boolean): BasketLine | null {
  const l = b.lines.find((x) => x.key === key);
  if (!l || l.price == null || l.total == null) return null;
  if (l.status === "old" && !useOld) return null;
  return l;
}

/** A saving this large on one item is more often a wrong match or a sale price than a real difference. */
export const CHECK_PCT = 40;
const isCheck = (baseline: number, price: number) => baseline > 0 && (baseline - price) / baseline * 100 > CHECK_PCT;

/** How many items a stop is compared on, how many are cheaper there, and the average percent less (against the usual store, on those). */
function stopStats(lines: PlanLine[], refTotals: Map<string, number>) {
  const compared = lines.filter((l) => l.saving != null);
  const base = compared.reduce((t, l) => t + (refTotals.get(l.key) ?? 0), 0);
  const saved = compared.reduce((t, l) => t + (l.saving ?? 0), 0);
  return { comparedOn: compared.length, cheaperOn: compared.filter((l) => (l.saving ?? 0) > 0.004).length, pct: base > 0 ? Math.round(saved / base * 100) : 0 };
}

/* ---------------- how often you shop ---------------- */

/** Shopping trips a month, from the days you bought groceries (middle gap, last 4 months). null when there are fewer than 4 shopping days. */
export function tripsPerMonth(products: Product[], currency: string, now: Date): number | null {
  const days = new Set<string>();
  for (const p of products) {
    if (p.currency !== currency) continue;
    for (const h of p.history) if (ageDays(h.date, now) <= 120) days.add(h.date);
  }
  const d = [...days].sort();
  if (d.length < 4) return null;
  const gaps = d.slice(1).map((x, i) => ageDays(d[i], new Date(`${x}T00:00:00Z`))).filter((g) => g > 0);
  if (gaps.length < 3) return null;
  const gap = median(gaps);
  return Math.min(12, Math.max(1, Math.round(30 / gap)));
}

/* ---------------- driving ---------------- */

const perms = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

/** Home (or where you are), each stop once, back again: the shortest order, with the road allowance. */
export function tour(origin: LatLng, stops: LatLng[]): { km: number; order: number[] } {
  if (stops.length === 0) return { km: 0, order: [] };
  let best = { km: Infinity, order: [] as number[] };
  for (const p of perms(stops.map((_, i) => i))) {
    let km = 0, at = origin;
    for (const i of p) { km += distanceKm(at, stops[i]); at = stops[i]; }
    km += distanceKm(at, origin);
    if (km < best.km) best = { km, order: p };
  }
  return { km: round2(best.km * ROAD_FACTOR), order: best.order };
}

/** A Google Maps directions link: from where you are (if known) through every stop; the last stop is the destination. */
export function directionsUrl(origin: LatLng | null, stops: LatLng[]): string | null {
  if (stops.length === 0) return null;
  const f = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const dest = stops[stops.length - 1];
  const via = stops.slice(0, -1);
  let u = `https://www.google.com/maps/dir/?api=1&destination=${f(dest)}&travelmode=driving`;
  if (origin) u += `&origin=${f(origin)}`;
  if (via.length) u += `&waypoints=${encodeURIComponent(via.map(f).join("|"))}`;
  return u;
}

/* ---------------- plans ---------------- */

export type PlanLine = { key: string; name: string; qty: number; price: number; total: number; /** against the usual store; null when the usual store has no price for it */ saving: number | null; source: BasketLine["source"]; similar?: boolean; old: boolean; /** over 40% cheaper than your usual store on this one item: worth a second look */ check?: boolean };
export type PlanStop = { store: string; at: LatLng; km: number; lines: PlanLine[]; total: number; saving: number; /** items here with a price at your usual store too */ comparedOn: number; /** of those, the ones cheaper here */ cheaperOn: number; /** percent less than your usual store on the compared items (0 when none) */ pct: number };
export type Plan = {
  stops: PlanStop[];
  /** Cost of the items that have a price at one of the stops */
  itemsTotal: number;
  /** What those items save against your usual store, before driving */
  saving: number;
  /** Extra driving against your usual store, in money (0 when driving is not counted) */
  driving: number;
  /** Saving after driving: what the plan is judged by */
  net: number;
  /** Return trip in km */
  km: number;
  covered: number;
  uncovered: number;
  /** What this plan adds over the one with one stop fewer, after driving (null for the first plan) */
  adds: number | null;
  /** Savings so large (over 40% of one item) that the price is worth a second look */
  checks: number;
};
export type PlanSet = { plans: Plan[]; /** Items priced at your usual store and at another store nearby: the ones a saving is worked out on */ comparable: number; itemCount: number; /** index of the plan to recommend, or -1 when none beats shopping at your usual store */ best: number; usual: string | null; usualTotal: number };

function combos<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  return [...combos(xs.slice(1), k - 1).map((c) => [xs[0], ...c]), ...combos(xs.slice(1), k)];
}

/**
 * The best one, two and three stops for the cart. Each item is bought where it is cheapest among the stops. Savings are against your
 * usual store, on the items it has a price for. With driving counted, the extra kilometres against the trip to your usual store are
 * taken off; a further stop is only recommended when it adds at least the smallest worthwhile saving.
 */
export function planCart(a: { items: ListItem[]; baskets: StoreBasket[]; where: Map<string, LatLng>; origin: LatLng | null; usual: string | null; s: SmartSettings }): PlanSet {
  const { items, baskets, where, origin, usual, s } = a;
  const empty: PlanSet = { plans: [], best: -1, usual, usualTotal: 0, comparable: 0, itemCount: items.length };
  if (!origin || items.length === 0) return empty;
  const ref = usual ? baskets.find((b) => sameStore(b.store, usual)) ?? null : null;
  const refLine = (key: string) => (ref ? priced(ref, key, s.useOld) : null);
  const usualTotal = round2(items.reduce((t, it) => { const l = refLine(it.key); return t + (l?.total ?? 0); }, 0));
  const near = baskets
    .flatMap((b) => { const at = where.get(b.store); return at && distanceKm(origin, at) <= s.maxKm && items.some((it) => priced(b, it.key, s.useOld)) ? [{ b, at, d: distanceKm(origin, at) }] : []; })
    .sort((x, y) => x.d - y.d)
    .slice(0, 8);
  if (near.length === 0) return empty;
  const refAt = usual ? where.get(usual) ?? near.find((n) => sameStore(n.b.store, usual))?.at ?? null : null;
  const baseKm = refAt ? tour(origin, [refAt]).km : 0;
  const refTotals = new Map<string, number>();
  for (const it of items) { const l = refLine(it.key); if (l) refTotals.set(it.key, l.price! * it.qty); }
  // the items a saving is worked out on: priced at your usual store and at another store nearby
  const comparable = items.filter((it) => refLine(it.key) && near.some((n) => !sameStore(n.b.store, usual ?? "") && priced(n.b, it.key, s.useOld))).length;

  const build = (set: typeof near): Plan => {
    const byStore = new Map<string, PlanLine[]>();
    let covered = 0, itemsTotal = 0, saving = 0;
    for (const it of items) {
      let pick: { n: (typeof near)[number]; l: BasketLine } | null = null;
      for (const n of set) {
        const l = priced(n.b, it.key, s.useOld);
        if (l && (!pick || l.price! < pick.l.price! - 1e-9 || (Math.abs(l.price! - pick.l.price!) < 1e-9 && n.d < pick.n.d))) pick = { n, l };
      }
      if (!pick) continue;
      covered++;
      const r = refLine(it.key);
      const sv = r ? round2((r.price! - pick.l.price!) * it.qty) : null;
      itemsTotal += pick.l.total!;
      saving += sv ?? 0;
      const list = byStore.get(pick.n.b.store) ?? [];
      list.push({ key: it.key, name: pick.l.name, qty: it.qty, price: pick.l.price!, total: pick.l.total!, saving: sv, source: pick.l.source, similar: pick.l.similar, old: pick.l.status === "old", check: r ? isCheck(r.price!, pick.l.price!) : false });
      byStore.set(pick.n.b.store, list);
    }
    const used = set.filter((n) => byStore.has(n.b.store));
    const t = tour(origin, used.map((n) => n.at));
    const ordered = t.order.map((i) => used[i]);
    const stops: PlanStop[] = ordered.map((n) => {
      const lines = byStore.get(n.b.store)!;
      return { store: n.b.store, at: n.at, km: round2(n.d * ROAD_FACTOR), lines, total: round2(lines.reduce((x, l) => x + l.total, 0)), saving: round2(lines.reduce((x, l) => x + (l.saving ?? 0), 0)), ...stopStats(lines, refTotals) };
    });
    const driving = s.includeDriving ? round2((t.km - baseKm) * s.perKm) : 0;
    saving = round2(saving);
    return { stops, itemsTotal: round2(itemsTotal), saving, driving, net: round2(saving - driving), km: t.km, covered, uncovered: items.length - covered, adds: null, checks: stops.reduce((n, st) => n + st.lines.filter((l) => l.check).length, 0) };
  };

  const plans: Plan[] = [];
  for (let k = 1; k <= Math.min(s.maxStops, near.length); k++) {
    let top: Plan | null = null;
    for (const c of combos(near, k)) {
      const p = build(c);
      // a stop nothing is bought at is not a stop
      if (p.stops.length < k) continue;
      if (!top || p.net > top.net + 1e-9 || (Math.abs(p.net - top.net) < 1e-9 && p.km < top.km)) top = p;
    }
    if (top) { if (plans.length) top.adds = round2(top.net - plans[plans.length - 1].net); plans.push(top); }
  }
  let best = -1;
  plans.forEach((p, i) => {
    if (best < 0) { if (p.net > 0) best = i; return; }
    if (p.net - plans[best].net >= Math.max(0.01, s.minSaving)) best = i;
  });
  return { plans, best, usual, usualTotal, comparable, itemCount: items.length };
}

/* ---------------- every supermarket (driving not counted) ---------------- */

export type StoreRow = { store: string; km: number | null; at: LatLng | null; total: number; priced: number; unpriced: number; /** against your usual store, on the items both price; null for the usual store itself or when nothing is shared */ vsUsual: number | null; usual: boolean; lines: PlanLine[]; /** items priced here and at your usual store */ compared: number; /** average percent against your usual store on those (negative is cheaper); null with fewer than MIN_COMPARED items */ avgPct: number | null; confidence: "strong" | "fair" | "few" | null; /** the lowest average against your usual store, among stores with enough items to compare (the usual store counts as 0) */ cheapest: boolean };

/** Fewer comparable items than this and no average is shown as a saving. */
export const MIN_COMPARED = 5;

/** The cart at every supermarket, the one that prices most of it first, then the lowest total. Distance is shown and not charged. */
export function storeRows(a: { items: ListItem[]; baskets: StoreBasket[]; where: Map<string, LatLng>; origin: LatLng | null; usual: string | null; s: SmartSettings }): StoreRow[] {
  const { items, baskets, where, origin, usual, s } = a;
  const ref = usual ? baskets.find((b) => sameStore(b.store, usual)) ?? null : null;
  const rows: StoreRow[] = [];
  for (const b of baskets) {
    const lines: PlanLine[] = [];
    let shared = 0, diff = 0, baseSum = 0, fresh = 0;
    for (const it of items) {
      const l = priced(b, it.key, s.useOld);
      if (!l) continue;
      const r = ref && !sameStore(b.store, ref.store) ? priced(ref, it.key, s.useOld) : null;
      const sv = r ? round2((r.price! - l.price!) * it.qty) : null;
      if (r) { shared++; diff += (l.price! - r.price!) * it.qty; baseSum += r.price! * it.qty; if (l.status !== "old") fresh++; }
      lines.push({ key: it.key, name: l.name, qty: it.qty, price: l.price!, total: l.total!, saving: sv, source: l.source, similar: l.similar, old: l.status === "old", check: r ? isCheck(r.price!, l.price!) : false });
    }
    if (lines.length === 0) continue;
    const at = where.get(b.store) ?? null;
    const km = at && origin ? round2(distanceKm(origin, at) * ROAD_FACTOR) : null;
    if (at && origin && distanceKm(origin, at) > s.maxKm) continue;
    rows.push({ store: b.store, km, at, total: round2(lines.reduce((x, l) => x + l.total, 0)), priced: lines.length, unpriced: items.length - lines.length, vsUsual: shared > 0 ? round2(diff) : null, usual: !!usual && sameStore(b.store, usual), lines, compared: shared, avgPct: shared >= MIN_COMPARED && baseSum > 0 ? Math.round(diff / baseSum * 100) : null, confidence: !usual || sameStore(b.store, usual) ? null : shared < MIN_COMPARED ? "few" : fresh / shared >= 0.7 ? "strong" : "fair", cheapest: false });
  }
  // "Cheapest" is the lowest average against your usual store, among stores with enough items to compare. It is never just the store that prices most.
  const value = (r: StoreRow) => (r.usual ? 0 : r.avgPct);
  if (rows.some((r) => !r.usual && r.avgPct != null) && rows.some((r) => r.usual)) {
    const ranked = rows.filter((r) => value(r) != null).sort((x, y) => value(x)! - value(y)! || (x.usual ? -1 : 0) - (y.usual ? -1 : 0));
    if (ranked[0]) ranked[0].cheapest = true;
  }
  return rows.sort((x, y) => Number(y.cheapest) - Number(x.cheapest) || y.priced - x.priced || x.total - y.total);
}

/* ---------------- one store, item by item ---------------- */

export type DetailLine = PlanLine & {
  /** The usual store's price for it (when this is not the usual store) */
  ref: { store: string; price: number } | null;
  /** At your usual store: the cheapest other store for it, when one is cheaper */
  better: { store: string; price: number; saving: number } | null;
};
export type StoreDetail = {
  store: string;
  usual: string | null;
  isUsual: boolean;
  lines: DetailLine[];
  /** Cart items this store has no real price for: left out, never guessed */
  notPriced: string[];
  /** Items priced here and at your usual store */
  compared: number;
  cheaper: number;
  dearer: number;
  /** Money saved by buying the compared items here instead of at your usual store (negative: costs more) */
  saving: number;
  /** Percent less than your usual store on the compared items (negative: more); null with fewer than MIN_COMPARED items */
  pct: number | null;
  confidence: "strong" | "fair" | "few" | null;
  /** At your usual store: the items cheaper somewhere else, what that saves, and the store that saves most */
  elsewhere: { count: number; saving: number; store: string | null };
};

/** What tapping a store shows: each item here against your usual store, and for the usual store itself where else it is cheaper. */
export function storeDetail(a: { store: string; items: ListItem[]; baskets: StoreBasket[]; usual: string | null; s: SmartSettings; /** only compare with these stores (the ones within reach) */ among?: string[] }): StoreDetail | null {
  const { store, items, baskets, usual, s } = a;
  const b = baskets.find((x) => sameStore(x.store, store));
  if (!b) return null;
  const isUsual = !!usual && sameStore(store, usual);
  const ref = usual && !isUsual ? baskets.find((x) => sameStore(x.store, usual)) ?? null : null;
  const others = baskets.filter((x) => !sameStore(x.store, store) && (!a.among || a.among.some((n) => sameStore(n, x.store))));
  const lines: DetailLine[] = [];
  const notPriced: string[] = [];
  let cheaper = 0, dearer = 0, saving = 0, base = 0, fresh = 0, compared = 0;
  const byStore = new Map<string, number>();
  let elseCount = 0, elseSaving = 0;
  for (const it of items) {
    const l = priced(b, it.key, s.useOld);
    if (!l) { notPriced.push(baskets.flatMap((x) => x.lines).find((x) => x.key === it.key)?.name ?? it.key); continue; }
    const r = ref ? priced(ref, it.key, s.useOld) : null;
    let sv: number | null = null;
    let better: DetailLine["better"] = null;
    if (r) {
      sv = round2((r.price! - l.price!) * it.qty);
      compared++; base += r.price! * it.qty; saving += (r.price! - l.price!) * it.qty;
      if (sv > 0.004) cheaper++; else if (sv < -0.004) dearer++;
      if (l.status !== "old") fresh++;
    } else if (isUsual) {
      let best: { store: string; price: number } | null = null;
      for (const o of others) { const x = priced(o, it.key, s.useOld); if (x && (!best || x.price! < best.price - 1e-9)) best = { store: o.store, price: x.price! }; }
      if (best && best.price < l.price! - 1e-9) {
        const sav = round2((l.price! - best.price) * it.qty);
        better = { store: best.store, price: best.price, saving: sav };
        elseCount++; elseSaving += sav; byStore.set(best.store, (byStore.get(best.store) ?? 0) + sav);
      }
    }
    lines.push({ key: it.key, name: l.name, qty: it.qty, price: l.price!, total: l.total!, saving: sv, source: l.source, similar: l.similar, old: l.status === "old", check: r ? isCheck(r.price!, l.price!) : false, ref: r ? { store: ref!.store, price: r.price! } : null, better });
  }
  lines.sort((x, y) => (y.better?.saving ?? y.saving ?? -Infinity) - (x.better?.saving ?? x.saving ?? -Infinity));
  const top = [...byStore].sort((x, y) => y[1] - x[1])[0];
  return {
    store: b.store, usual, isUsual, lines, notPriced, compared, cheaper, dearer, saving: round2(saving),
    pct: compared >= MIN_COMPARED && base > 0 ? Math.round(saving / base * 100) : null,
    confidence: !ref ? null : compared < MIN_COMPARED ? "few" : fresh / compared >= 0.7 ? "strong" : "fair",
    elsewhere: { count: elseCount, saving: round2(elseSaving), store: top ? top[0] : null },
  };
}

/* ---------------- items you add yourself ---------------- */

export const MAX_ADDED = 20;
/** An item added by hand: one you have bought before ("own": priced like the usual cart) or one found in the store lists and community prices ("listed"). */
export type AddedItem = {
  key: string; name: string; size: string | null; qty: number; kind: "own" | "listed";
  /** For a listed item: the real prices found for it, kept so the cart opens without a lookup and refreshed when online */
  offers: { store: string; price: number; source: "community" | "online"; similar?: boolean }[];
};

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** The key of a listed item: the same words always give the same key, so adding it twice is one item. */
export const listedKey = (name: string, size: string | null) => `x:${clean(name, 80).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()}|${(size ?? "").toLowerCase().replace(/\s+/g, "")}`;

/** What was saved on the phone, made safe: wrong shapes are dropped, quantities and prices are limited. */
export function sanitizeAdded(raw: unknown): AddedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AddedItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = clean(o.key, 300), name = clean(o.name, 160);
    const kind = o.kind === "own" || o.kind === "listed" ? o.kind : null;
    if (!key || !name || !kind || out.some((x) => x.key === key)) continue;
    if (kind === "listed" && !key.startsWith("x:")) continue;
    const offers = (Array.isArray(o.offers) ? o.offers : []).flatMap((x) => {
      if (!x || typeof x !== "object") return [];
      const p = x as Record<string, unknown>;
      const store = clean(p.store, 120), price = typeof p.price === "number" ? p.price : NaN;
      return store && Number.isFinite(price) && price > 0 && price < 100000 && (p.source === "community" || p.source === "online") ? [{ store, price: round2(price), source: p.source as "community" | "online", ...(p.similar === true ? { similar: true } : {}) }] : [];
    }).slice(0, 12);
    out.push({ key, name, size: clean(o.size, 40) || null, qty: Math.min(99, Math.max(1, Math.round(typeof o.qty === "number" ? o.qty : 1))), kind, offers: kind === "listed" ? offers : [] });
    if (out.length >= MAX_ADDED) break;
  }
  return out;
}

/** The part of a product the basket maths reads (key, name, no receipts), for an item that has never been on one of your receipts. */
export function addedProduct(a: AddedItem, currency: string): Product {
  return { key: a.key, atomKeys: [], name: a.name, size: a.size, currency, unit: null, category: "Other", names: [{ atomKey: a.key, name: a.name }], history: [], stores: [], cheapestStore: null, saving: null, totalSpent: 0, lastDate: "", count: 0, trend: "flat", changePct: null } as unknown as Product;
}

/** A listed item's prices as the real prices the basket fills gaps with. */
export const addedExternal = (a: AddedItem): ExternalPrice[] => (a.kind === "listed" ? a.offers.map((o) => ({ store: o.store, key: a.key, price: o.price, source: o.source, ...(o.similar ? { similar: true } : {}) })) : []);

/** The cheapest price found for a listed item, for the line under its name. */
export function cheapestOffer(a: AddedItem): { store: string; price: number } | null {
  let best: { store: string; price: number } | null = null;
  for (const o of a.offers) if (!best || o.price < best.price) best = { store: o.store, price: o.price };
  return best;
}
