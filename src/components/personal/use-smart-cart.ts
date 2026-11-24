"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchPrices, pricesKey, fetchPriceMatches, priceMatchesKey } from "@/lib/offline-grocery";
import { fetchAll } from "@/lib/personal/fetch-all";
import { useCachedQuery } from "@/lib/use-cached-query";
import { buildProducts, type MatchDecision } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { externalPrices } from "@/lib/personal/best-prices";
import { ONLINE_CURRENCY, type OnlineMatch } from "@/lib/store-prices";
import { searchCommunity } from "@/lib/personal/community";
import { distanceKm, sameStore, type ExternalPrice, type LatLng, type ListItem } from "@/lib/personal/basket";
import { DEFAULT_SETTINGS, MAX_ADDED, addedExternal, addedProduct, habitItems, learning, planCart, sanitizeAdded, sanitizeSettings, smartBaskets, storeRows, usualStore, type AddedItem, type HabitItem, type SmartSettings } from "@/lib/personal/smart-cart";
import { searchBestPrices } from "@/lib/personal/best-prices";
import { productWords } from "@/lib/personal/price-compare";
import { useOnline } from "@/lib/use-online";
import { useCountry } from "@/components/personal/use-country";
import { countryForShared, currencyOfCountry } from "@/lib/country";

type Loc = { name: string; lat: number; lng: number };
const clamp = (q: number) => Math.min(99, Math.max(1, Math.round(q)));
type Saved = { settings: SmartSettings; off: string[]; qty: Record<string, number>; added: AddedItem[] };

const read = (k: string): Saved => {
  try {
    const o = JSON.parse(localStorage.getItem(k) ?? "{}") as Partial<Saved>;
    const qty: Record<string, number> = {};
    for (const [key, v] of Object.entries(o.qty ?? {})) if (typeof v === "number" && v >= 1 && v <= 99) qty[key] = Math.round(v);
    return { settings: sanitizeSettings(o.settings), off: Array.isArray(o.off) ? o.off.filter((x): x is string => typeof x === "string") : [], qty, added: sanitizeAdded(o.added) };
  } catch { return { settings: DEFAULT_SETTINGS, off: [], qty: {}, added: [] }; }
};

/** Everything the Smart Cart screen needs: your usual cart, prices at each store, where you are, and what you changed (kept on this phone). */
export function useSmartCart() {
  const cn = useCountry();
  const country = cn.country;
  const online = useOnline();
  const prices = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matches = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const locQ = useCachedQuery<Loc[]>((uid) => `${uid}:basket:locs`, async (sb) => { const r = await sb.from("store_locations").select("name, lat, lng"); return { data: (r.data ?? []) as Loc[], error: r.error }; }, []);
  const placesQ = useCachedQuery<Loc[]>((uid) => `${uid}:basket:places:${country ?? "all"}`, async (sb) => {
    try {
      const load = (withCountry: boolean) => fetchAll<Loc>((a, b) => {
        const q = sb.from("supermarket_places").select("id, name, lat, lng");
        return (withCountry && country ? q.eq("country", country) : q).order("id").range(a, b);
      });
      return { data: await load(true).catch(() => load(false)), error: null };
    } catch { return { data: [] as Loc[], error: null }; }
  }, [country]);

  const now = useMemo(() => new Date(), []);
  const { products } = useMemo(() => buildProducts(prices.data ?? [], matches.data ?? []), [prices.data, matches.data]);
  const currency = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of products) n.set(p.currency, (n.get(p.currency) ?? 0) + p.count);
    return currencyOfCountry(country) ?? [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [products, country]);
  const inCur = useMemo(() => products.filter((p) => p.currency === currency), [products, currency]);
  const habits = useMemo<HabitItem[]>(() => habitItems(inCur, currency, now), [inCur, currency, now]);
  const progress = useMemo(() => learning(inCur, currency, now), [inCur, currency, now]);

  // what the person changed: kept on this phone for this account
  const [uid, setUid] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>({ settings: DEFAULT_SETTINGS, off: [], qty: {}, added: [] });
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => { const id = session?.user.id ?? null; setUid(id); if (id) setSaved(read(`lifolio:smartcart:${id}`)); }).catch(() => {});
  }, []);
  const update = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((cur) => {
      const next = fn(cur);
      try { if (uid) localStorage.setItem(`lifolio:smartcart:${uid}`, JSON.stringify(next)); } catch { /* the choice just is not kept */ }
      return next;
    });
  }, [uid]);
  const settings = saved.settings;
  const setSettings = useCallback((p: Partial<SmartSettings>) => update((s) => ({ ...s, settings: sanitizeSettings({ ...s.settings, ...p }) })), [update]);
  const toggle = useCallback((key: string) => update((s) => ({ ...s, off: s.off.includes(key) ? s.off.filter((k) => k !== key) : [...s.off, key] })), [update]);
  const setQty = useCallback((key: string, q: number) => update((s) => (s.added.some((a) => a.key === key)
    ? { ...s, added: s.added.map((a) => (a.key === key ? { ...a, qty: clamp(q) } : a)) }
    : { ...s, qty: { ...s.qty, [key]: clamp(q) } })), [update]);
  /** Put something in the cart: a usual item that was left out comes back; anything else is added (up to 20). */
  const add = useCallback((a: AddedItem) => update((s) => {
    if (s.off.includes(a.key)) return { ...s, off: s.off.filter((k) => k !== a.key) };
    if (s.added.some((x) => x.key === a.key) || s.added.length >= MAX_ADDED) return s;
    return { ...s, added: [...s.added, a] };
  }), [update]);
  const removeAdded = useCallback((key: string) => update((s) => ({ ...s, added: s.added.filter((a) => a.key !== key) })), [update]);

  const habitKeys = useMemo(() => new Set(habits.map((h) => h.key)), [habits]);
  const added = saved.added;
  /** Added items that are also usual items are the usual item (never counted twice) */
  const extra = useMemo(() => added.filter((a) => !habitKeys.has(a.key)), [added, habitKeys]);
  const items = useMemo<ListItem[]>(() => [
    ...habits.filter((h) => !saved.off.includes(h.key)).map((h) => ({ key: h.key, qty: saved.qty[h.key] ?? h.qty })),
    ...extra.map((a) => ({ key: a.key, qty: a.qty })),
  ], [habits, saved, extra]);
  // prices are asked for what is bought before; a listed item brings its own prices
  const itemsKey = [...habits.map((h) => h.key), ...extra.filter((a) => a.kind === "own").map((a) => a.key)].sort().join("|");
  const listedItems = useMemo(() => extra.filter((a) => a.kind === "listed"), [extra]);
  const extraProducts = useMemo(() => extra.filter((a) => a.kind === "listed").map((a) => addedProduct(a, currency)), [extra, currency]);
  const extraExt = useMemo(() => extra.flatMap(addedExternal), [extra]);

  // prices from outside your receipts, for the whole usual cart
  const [external, setExternal] = useState<ExternalPrice[]>([]);
  const [externalReady, setExternalReady] = useState(false);
  useEffect(() => {
    if (!online || !itemsKey) { setExternal([]); setExternalReady(true); return; }
    let off = false;
    setExternalReady(false);
    (async () => {
      const keys = itemsKey.split("|");
      const [c, o] = await Promise.all([
        searchCommunity(createClient(), { keys }, countryForShared(currency, country)).catch(() => []),
        currency === ONLINE_CURRENCY
          ? fetch("/api/store-prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: inCur.filter((p) => keys.includes(p.key)).map((p) => ({ key: p.key, names: p.names.map((n) => n.name) })) }) })
              .then(async (r) => (r.ok ? (((await r.json()) as { matches?: Record<string, OnlineMatch[]> }).matches ?? {}) : {}))
              .catch(() => ({}) as Record<string, OnlineMatch[]>)
          : Promise.resolve({} as Record<string, OnlineMatch[]>),
      ]);
      if (!off) { setExternal(externalPrices(c, o, currency)); setExternalReady(true); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey is the list of products asked about
  }, [online, itemsKey, currency, country]);

  const stores = useMemo(() => {
    const out: string[] = [];
    const keys = itemsKey.split("|");
    for (const n of [...inCur.flatMap((p) => p.stores.map((s) => s.store)), ...external.filter((e) => keys.includes(e.key)).map((e) => e.store), ...extraExt.map((e) => e.store)]) if (!out.some((x) => sameStore(x, n))) out.push(n);
    return out;
  }, [inCur, external, itemsKey, extraExt]);

  // a listed item's prices are looked up again when you are online, so they stay current
  const listedKeys = listedItems.map((a) => a.key).join("\u0001");
  useEffect(() => {
    if (!online || !listedKeys) return;
    let off = false;
    (async () => {
      for (const a of listedItems) {
        const q = a.name;
        const [c, o] = await Promise.all([
          searchCommunity(createClient(), { q }, countryForShared(currency, country)).catch(() => []),
          currency === ONLINE_CURRENCY
            ? fetch("/api/store-prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ search: q }) }).then(async (r) => (r.ok ? (((await r.json()) as { results?: OnlineMatch[] }).results ?? []) : [])).catch(() => [] as OnlineMatch[])
            : Promise.resolve([] as OnlineMatch[]),
        ]);
        if (off) return;
        const want = [...productWords(a.name)].sort().join(" ");
        const g = searchBestPrices({ q, products: [], community: c, online: o, currency }).find((x) => [...productWords(x.name)].sort().join(" ") === want && (!a.size || !x.size || a.size.toLowerCase().replace(/\s+/g, "") === x.size.toLowerCase().replace(/\s+/g, "")));
        const offers = g ? g.offers.filter((x) => x.source !== "own").map((x) => ({ store: x.store, price: x.price, source: x.source as "community" | "online" })) : [];
        if (offers.length > 0) update((s) => ({ ...s, added: s.added.map((x) => (x.key === a.key ? { ...x, offers: offers.slice(0, 12) } : x)) }));
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the set of listed items changes
  }, [online, listedKeys, currency, country]);

  // where you start: your saved home, or where you are now
  const [home, setHome] = useState<LatLng | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [from, setFrom] = useState<"home" | "here">("home");
  const [geo, setGeo] = useState<"idle" | "asking" | "denied">("idle");
  const away = !!country && !!cn.homeCountry && country !== cn.homeCountry;
  const homeHere = away ? null : home;
  const origin = from === "home" && homeHere ? homeHere : here ?? homeHere;
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data, error } = await sb.from("profiles").select("home_lat, home_lng").eq("id", session.user.id).single();
      if (!error && data?.home_lat != null && data?.home_lng != null) setHome({ lat: Number(data.home_lat), lng: Number(data.home_lng) });
    })().catch(() => {});
  }, []);
  const locate = useCallback(() => {
    if (!navigator.geolocation) { setGeo("denied"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setFrom("here"); setGeo("idle"); },
      () => setGeo("denied"),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);
  useEffect(() => { navigator.permissions?.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {}); }, [locate]);

  // the nearest place of each store
  const where = useMemo(() => {
    const m = new Map<string, LatLng>();
    const all = [...(locQ.data ?? []), ...(placesQ.data ?? [])];
    for (const s of stores) {
      let best: LatLng | null = null, d = Infinity;
      for (const l of all) if (sameStore(l.name, s)) { const k = origin ? distanceKm(origin, l) : 0; if (k < d) { d = k; best = { lat: l.lat, lng: l.lng }; } }
      if (best) m.set(s, best);
    }
    return m;
  }, [stores, locQ.data, placesQ.data, origin]);

  const baskets = useMemo(() => smartBaskets(items, [...inCur, ...extraProducts], stores, now, [...external, ...extraExt], settings, currency), [items, inCur, extraProducts, stores, now, external, extraExt, settings, currency]);
  const usual = useMemo(() => usualStore(items, inCur), [items, inCur]);
  const plan = useMemo(() => planCart({ items, baskets, where, origin, usual, s: settings }), [items, baskets, where, origin, usual, settings]);
  const rows = useMemo(() => storeRows({ items, baskets, where, origin, usual, s: settings }), [items, baskets, where, origin, usual, settings]);

  return {
    loading: prices.loading || matches.loading || locQ.loading, error: prices.error, savedAt: prices.savedAt, currency, country, online,
    habits, progress, items, off: saved.off, qty: saved.qty, toggle, setQty, settings, setSettings, products: inCur, extra, add, removeAdded,
    externalReady, plan, rows, usual, origin, homeHere, here, from, setFrom, geo, locate, hasPlaces: where.size > 0, noReceipts: inCur.length === 0,
  };
}
