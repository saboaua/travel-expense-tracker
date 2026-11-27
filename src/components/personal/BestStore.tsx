"use client";

import { getFix, lastFix } from "@/lib/geo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Money } from "@/components/ui/money";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronDown, ChevronUp, Crosshair, ExternalLink, Info, MapPin, Minus, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MapPin as Pin } from "@/components/personal/StoreMap";
import { PriceSearch } from "@/components/personal/PriceSearch";
import { OfflineNotice } from "@/components/OfflineNotice";
import { createClient } from "@/lib/supabase/client";
import { fetchPrices, pricesKey, fetchPriceMatches, priceMatchesKey } from "@/lib/offline-grocery";
import { fetchAll } from "@/lib/personal/fetch-all";
import { useCachedQuery } from "@/lib/use-cached-query";
import { buildProducts, type MatchDecision } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { externalPrices } from "@/lib/personal/best-prices";
import { ONLINE_CURRENCY, type OnlineMatch } from "@/lib/store-prices";
import { searchCommunity } from "@/lib/personal/community";
import { RADII, basketTotals, type ExternalPrice, bestStoreFor, distanceKm, LEVEL_LABEL, sameStore, splitAdvice, storeIndex, usualItems, type Level, type LatLng, type ListItem } from "@/lib/personal/basket";
import { itemGrid, levelRows, levelWords, sourceNote, unpricedStores, verdict } from "@/lib/personal/best-store-view";
import { useOnline } from "@/lib/use-online";
import { useCountry, useCountryStats } from "@/components/personal/use-country";
import { CountrySwitch } from "@/components/personal/CountrySwitch";
import { countryForShared, currencyOfCountry, hasPriceData } from "@/lib/country";
import { formatCurrency } from "@/lib/utils";

const StoreMap = dynamic(() => import("@/components/personal/StoreMap"), { ssr: false, loading: () => <div className="h-80 w-full animate-pulse sm:h-96 md:h-[30rem] rounded-xl border bg-muted" aria-label="Loading map" /> });

type ListRow = { id: string; product_key: string; name: string; qty: number };
type Loc = { id: string; name: string; lat: number; lng: number; source: string };
type Osm = { osmId: string; name: string; lat: number; lng: number };

const LEVEL_CLS: Record<Level, string> = {
  cheapest: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  below: "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200",
  average: "bg-muted text-muted-foreground",
  above: "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200",
  dearest: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  nodata: "bg-muted text-muted-foreground",
};
const chip = "inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;
const heading = "text-xs font-bold uppercase tracking-wide text-muted-foreground";

function Level({ level, pct }: { level: Level; pct: number | null }) {
  return <span className={`${chip} ${LEVEL_CLS[level]}`}>{LEVEL_LABEL[level]}{pct != null && level !== "nodata" ? ` ${signed(pct)}` : ""}</span>;
}

export function BestStore() {
  const cn = useCountry();
  const cstats = useCountryStats();
  const country = cn.country;
  const prices = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matches = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const listQ = useCachedQuery<ListRow[]>((uid) => `${uid}:basket:list`, async (sb) => { const r = await sb.from("shopping_list_items").select("id, product_key, name, qty").order("created_at"); return { data: (r.data ?? []) as ListRow[], error: r.error }; }, []);
  const locQ = useCachedQuery<Loc[]>((uid) => `${uid}:basket:locs`, async (sb) => { const r = await sb.from("store_locations").select("id, name, lat, lng, source"); return { data: (r.data ?? []) as Loc[], error: r.error }; }, []);

  const placesQ = useCachedQuery<Osm[]>((uid) => `${uid}:basket:places:${country ?? "all"}`, async (sb) => {
    try {
      const load = (withCountry: boolean, withCategory = true) => fetchAll<{ id: string; name: string; lat: number; lng: number; category?: string | null }>((a, b) => {
        const q = sb.from("supermarket_places").select(withCategory ? "id, name, lat, lng, category" : "id, name, lat, lng");
        return (withCountry && country ? q.eq("country", country) : q).order("id").range(a, b) as never;
      });
      // a database without migration_country.sql has no country column: every place then belongs to the one list. Before the categories migration every place is a supermarket.
      const all = await load(true).catch(() => load(true, false)).catch(() => load(false, false));
      const rows = all.filter((r) => (r.category ?? "supermarkets") === "supermarkets");
      return { data: rows.map((r) => ({ osmId: `place/${r.id}`, name: r.name, lat: r.lat, lng: r.lng })), error: null };
    } catch { return { data: [] as Osm[], error: null }; } // the table is not there until the migration has been run
  }, [country]);

  const [radius, setRadius] = useState<number>(5);
  const [here, setHere] = useState<LatLng | null>(null);
  const [home, setHome] = useState<LatLng | null>(null);
  const [from, setFrom] = useState<"home" | "here">("home");
  // The saved home point only counts while the person is in their home country; abroad the map follows where they are
  const away = !!country && !!cn.homeCountry && country !== cn.homeCountry;
  const homeHere = away ? null : home;
  const origin = from === "home" && homeHere ? homeHere : here ?? homeHere;
  const me = origin;
  const [geo, setGeo] = useState<"idle" | "asking" | "denied">("idle");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [osm, setOsm] = useState<Osm[] | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => prices.data ?? [], [prices.data]);
  const { products } = useMemo(() => buildProducts(rows, matches.data ?? []), [rows, matches.data]);
  const currency = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of products) n.set(p.currency, (n.get(p.currency) ?? 0) + p.count);
    return currencyOfCountry(country) ?? [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [products, country]);
  const fmt = useCallback((n: number) => formatCurrency(n, currency), [currency]);
  const inCur = useMemo(() => products.filter((p) => p.currency === currency), [products, currency]);

  const list = useMemo<ListRow[]>(() => (listQ.data ?? []).filter((l) => inCur.some((p) => p.key === l.product_key)), [listQ.data, inCur]);
  const items: ListItem[] = useMemo(() => list.map((l) => ({ key: l.product_key, qty: l.qty })), [list]);
  const usual = useMemo(() => usualItems(inCur, currency, now).filter((u) => !list.some((l) => l.product_key === u.key)), [inCur, currency, now, list]);
  // Real prices from outside your receipts (community and online price lists) for what is on the list
  const [external, setExternal] = useState<ExternalPrice[]>([]);
  const online = useOnline();
  const listKey = items.map((i) => i.key).sort().join("|");
  useEffect(() => {
    if (!online || !listKey) { setExternal([]); return; }
    let off = false;
    (async () => {
      const keys = listKey.split("|");
      const [c, o] = await Promise.all([
        searchCommunity(createClient(), { keys }, countryForShared(currency, country)),
        currency === ONLINE_CURRENCY
          ? fetch("/api/store-prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: inCur.filter((p) => keys.includes(p.key)).map((p) => ({ key: p.key, names: p.names.map((n) => n.name) })) }) })
              .then(async (r) => (r.ok ? (((await r.json()) as { matches?: Record<string, OnlineMatch[]> }).matches ?? {}) : {}))
              .catch(() => ({}) as Record<string, OnlineMatch[]>)
          : Promise.resolve({} as Record<string, OnlineMatch[]>),
      ]);
      if (!off) setExternal(externalPrices(c, o, currency));
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listKey is the list of products asked about
  }, [online, listKey, currency, country]);
  const stores = useMemo(() => {
    const out = new Map<string, string>();
    for (const n of [...inCur.flatMap((p) => p.stores.map((s) => s.store)), ...external.filter((e) => listKey.split("|").includes(e.key)).map((e) => e.store)]) if (![...out.values()].some((x) => sameStore(x, n))) out.set(n.toLowerCase(), n);
    return [...out.values()];
  }, [inCur, external, listKey]);
  const index = useMemo(() => storeIndex(inCur, currency, now), [inCur, currency, now]);
  const baskets = useMemo(() => basketTotals(items, inCur, stores, index, now, external), [items, inCur, stores, index, now, external]);

  const locs = useMemo(() => locQ.data ?? [], [locQ.data]);
  const nearest = useCallback((store: string): { km: number; loc: Loc } | null => {
    if (!me) return null;
    let best: { km: number; loc: Loc } | null = null;
    for (const l of locs) if (sameStore(l.name, store)) { const km = distanceKm(me, l); if (!best || km < best.km) best = { km, loc: l }; }
    return best;
  }, [me, locs]);

  const ranked = baskets.filter((b) => { const d = nearest(b.store); return d && d.km <= radius && b.priced > 0; });
  const pricedAll = baskets.filter((b) => b.priced > 0);
  const unplaced = baskets.filter((b) => !locs.some((l) => sameStore(l.name, b.store)));
  const far = baskets.filter((b) => { const d = nearest(b.store); return d && d.km > radius && b.priced > 0; });
  const distMap = useMemo(() => new Map(baskets.flatMap((b) => { const d = nearest(b.store); return d ? [[b.store, d.km] as [string, number]] : []; })), [baskets, nearest]);
  const priced = useMemo(() => ranked.filter((b) => b.priced > 0), [ranked]);
  const split = useMemo(() => splitAdvice(items, ranked, distMap), [items, ranked, distMap]);
  const shown = me ? ranked : pricedAll;
  const headline = useMemo(() => verdict(shown, items.length), [shown, items.length]);
  const noPrice = useMemo(() => unpricedStores(baskets, (st) => distMap.get(st) ?? null, radius, !!me), [baskets, distMap, radius, me]);
  const grid = useMemo(() => itemGrid(shown), [shown]);
  const levels = useMemo(() => levelRows(index, baskets, items.length), [index, baskets, items.length]);
  const [onlyDiff, setOnlyDiff] = useState(false);

  // Places the admin imported, plus supermarkets found on OpenStreetMap around you (a place seen in both counts once)
  const known = useMemo<Osm[]>(() => {
    const out = [...(placesQ.data ?? [])];
    for (const o of osm ?? []) if (!out.some((k) => k.name.toLowerCase() === o.name.toLowerCase() && distanceKm(k, o) < 0.05)) out.push(o);
    return out;
  }, [placesQ.data, osm]);

  const mapPins = useMemo(() => {
    const pins: Pin[] = [];
    priced.forEach((b, i) => { for (const l of locs) if (sameStore(l.name, b.store) && me && distanceKm(me, l) <= radius) pins.push({ lat: l.lat, lng: l.lng, name: b.store, n: i + 1, best: i === 0, label: `${fmt(b.total)} for your list` }); });
    for (const o of known) {
      if (me && distanceKm(me, o) > radius) continue;
      if (pins.some((p) => p.n != null && distanceKm(p, o) < 0.05)) continue;
      pins.push({ lat: o.lat, lng: o.lng, name: o.name, n: null, label: stores.some((x) => sameStore(x, o.name)) ? "On your receipts" : "No receipts from here yet" });
    }
    return pins;
  }, [priced, locs, known, me, radius, stores, fmt]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setGeo("denied"); return; }
    setGeo("asking");
    void getFix().then((f) => { if (f) { setHere({ lat: f.lat, lng: f.lng }); setGeo("idle"); } else setGeo("denied"); });
  }, []);
  useEffect(() => {
    // A recent place from any screen is used as it is; otherwise only look straight away when the person has already allowed it, or they tap the button
    if (lastFix()) { locate(); return; }
    navigator.permissions?.query({ name: "geolocation" }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
  }, [locate]);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data, error } = await sb.from("profiles").select("home_lat, home_lng").eq("id", session.user.id).single();
      if (!error && data?.home_lat != null && data?.home_lng != null) setHome({ lat: Number(data.home_lat), lng: Number(data.home_lng) });
    })();
  }, []);
  async function saveHome(at: LatLng) {
    const u = await uid(); if (!u) return;
    const p = { lat: Math.round(at.lat * 1000) / 1000, lng: Math.round(at.lng * 1000) / 1000 };
    const { error } = await createClient().from("profiles").update({ home_lat: p.lat, home_lng: p.lng }).eq("id", u);
    if (error) setMsg(/home_lat|schema cache|column/i.test(error.message) ? "Run supabase/migration_home_gps.sql in Supabase first." : "Could not save your home point."); else { setHome(p); setFrom("home"); setMsg("Saved as your home point."); }
  }
  async function uid() { const { data: { session } } = await createClient().auth.getSession(); return session?.user.id ?? null; }
  async function addItem(key: string, name: string) {
    const u = await uid(); if (!u) return;
    const { error } = await createClient().from("shopping_list_items").upsert({ user_id: u, product_key: key, name, qty: 1 }, { onConflict: "user_id,product_key" });
    if (error) setMsg(/relation|schema cache/i.test(error.message) ? "Run supabase/migration_basket.sql in Supabase first." : error.message);
    else await listQ.reload();
  }
  async function setQty(row: ListRow, qty: number) {
    const sb = createClient();
    const { error } = qty < 1 ? await sb.from("shopping_list_items").delete().eq("id", row.id) : await sb.from("shopping_list_items").update({ qty: Math.min(99, qty) }).eq("id", row.id);
    if (error) setMsg(error.message); else await listQ.reload();
  }
  async function clearList() { const { error } = await createClient().from("shopping_list_items").delete().in("id", list.map((l) => l.id)); if (error) setMsg(error.message); else await listQ.reload(); }
  async function addLoc(name: string, at: LatLng, source: "pin" | "osm", osmId?: string) {
    const u = await uid(); if (!u) return;
    if (locs.some((l) => sameStore(l.name, name) && distanceKm(l, at) < 0.05)) return;
    const { error } = await createClient().from("store_locations").insert({ user_id: u, name, lat: at.lat, lng: at.lng, source, osm_id: osmId ?? null });
    if (error) setMsg(/relation|schema cache/i.test(error.message) ? "Run supabase/migration_basket.sql in Supabase first." : error.message);
    else await locQ.reload();
  }
  // Supermarkets around you load by themselves from OpenStreetMap. The ones that match a store on your receipts are saved as that store's places.
  const asked = useRef<string>("");
  useEffect(() => {
    if (!me) return;
    const k = `${me.lat.toFixed(2)},${me.lng.toFixed(2)}`;
    if (asked.current === k) return;
    asked.current = k;
    setBusy(true);
    fetch(`/api/stores-nearby?lat=${me.lat}&lon=${me.lng}&km=10`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) setMsg(j.error || "Could not load the stores around you."); else setOsm(j.stores as Osm[]); })
      .catch(() => setMsg("Could not load the stores around you. You are offline, or the map data is busy."))
      .finally(() => setBusy(false));
  }, [me]);
  const savedKeys = useRef(new Set<string>());
  useEffect(() => {
    if (locQ.loading || placesQ.loading || stores.length === 0 || known.length === 0) return;
    const fresh = known.flatMap((o) => {
      const s = bestStoreFor(o.name, stores);
      const k = s ? `${s}|${o.lat.toFixed(5)},${o.lng.toFixed(5)}` : "";
      return s && !savedKeys.current.has(k) && !locs.some((l) => sameStore(l.name, s) && distanceKm(l, o) < 0.05) ? [{ s, o, k }] : [];
    });
    if (!fresh.length) return;
    fresh.forEach((f) => savedKeys.current.add(f.k));
    (async () => {
      const u = await uid(); if (!u) return;
      const { error } = await createClient().from("store_locations").insert(fresh.map(({ s, o }) => ({ user_id: u, name: s, lat: o.lat, lng: o.lng, source: "osm", osm_id: o.osmId })));
      if (!error) await locQ.reload();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when places or stores arrive
  }, [known, locQ.loading, placesQ.loading, stores.length]);

  const q = find.trim().toLowerCase();
  const results = q ? inCur.filter((p) => p.name.toLowerCase().includes(q) && !list.some((l) => l.product_key === p.key)).slice(0, 6) : [];
  const loading = prices.loading || listQ.loading || locQ.loading;
  const noReceipts = !loading && inCur.length === 0;
  
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-28 md:p-8">
      <div>
        <Link href="/personal/groceries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groceries</Link>
        <h1 className="mt-1 text-2xl font-bold">Best Prices</h1>
        <p className="text-sm text-muted-foreground">Your receipts, community prices and online price lists</p>
      </div>
      <CountrySwitch state={cn} stats={cstats} />
      <PriceSearch products={inCur} currency={products.length || country ? currency : ONLINE_CURRENCY} country={country} />
      <OfflineNotice savedAt={prices.savedAt} />
      {(prices.error || msg) && <Alert variant={msg && !prices.error ? "info" : "error"}>{prices.error || msg}</Alert>}

      {noReceipts ? (
        country && cstats && !hasPriceData(cstats, country) ? (
          <Card data-testid="no-region-prices"><CardContent className="space-y-3 p-5 text-center">
            <ShoppingBasket className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-lg font-bold">No community prices available yet for this region</p>
            <p className="text-sm text-muted-foreground">Scan a grocery receipt and your prices start the ranking. Turn on price sharing to help the community.</p>
            <Link href="/personal/groceries/new" className="block"><Button className="w-full">Scan a grocery receipt</Button></Link>
            <Link href="/profile" className="block"><Button variant="outline" className="w-full">Share prices with the community</Button></Link>
          </CardContent></Card>
        ) : (
        <Card><CardContent className="space-y-2 p-5 text-center"><ShoppingBasket className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" /><p className="font-semibold">Scan a few receipts first</p><p className="text-sm text-muted-foreground">Your list is priced from what you paid. The more stores you have receipts from, the better the answer.</p><Link href="/personal/groceries/new"><Button>Scan a receipt</Button></Link></CardContent></Card>
        )
      ) : (
        <>
          <Card data-testid="shopping-list"><CardContent className="space-y-3 p-4">
            <div><h2 className="text-lg font-bold">Best store for your list</h2><p className="text-sm text-muted-foreground">{list.length} item{list.length === 1 ? "" : "s"}{me && ranked.length ? ` · ${ranked.length} store${ranked.length === 1 ? "" : "s"} within ${radius} km` : ""}</p></div>
            <div className="flex items-center justify-between"><h3 className={heading}>Your list</h3>{list.length > 0 && <button type="button" onClick={clearList} className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><Trash2 className="h-3 w-3" aria-hidden="true" /> Clear</button>}</div>
            {list.length === 0 && <p className="text-sm text-muted-foreground">Add what you usually buy, or search for an item.</p>}
            <ul className="space-y-1.5">
              {list.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm" data-testid="list-row">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={`Less ${l.name}`} onClick={() => setQty(l, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={`More ${l.name}`} onClick={() => setQty(l, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search an item you bought before" className="pl-9" aria-label="Search an item" /></div>
            {results.map((p) => <button key={p.key} type="button" onClick={() => { addItem(p.key, p.name); setFind(""); }} className="flex min-h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-sm hover:bg-muted" data-testid="search-result"><span className="truncate">{p.name}{p.size ? ` · ${p.size}` : ""}</span><Plus className="h-4 w-4 shrink-0" aria-hidden="true" /></button>)}
            {usual.length > 0 && <div><p className={`${heading} mb-1.5`}>Your usual items</p><div className="flex flex-wrap gap-1.5">{usual.slice(0, 12).map((u) => <button key={u.key} type="button" onClick={() => addItem(u.key, u.name)} data-testid="usual-item" className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-sm hover:bg-muted ${u.due ? "border-primary/50 bg-primary/5" : ""}`}><Plus className="h-3 w-3" aria-hidden="true" />{u.name}{u.due && <span className="text-[11px] font-semibold text-primary">due</span>}</button>)}</div></div>}
          </CardContent></Card>

          {items.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Radius">
                {RADII.map((r) => <Button key={r} type="button" variant={radius === r ? "default" : "outline"} className="h-11 rounded-full" aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</Button>)}
              </div>

              {(homeHere || here) && (
                <div className="space-y-1.5" data-testid="origin">
                  <p className={heading}>Measure distance from</p>
                  {homeHere ? (
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Measure distance from">
                      <Button type="button" variant={from === "home" ? "default" : "outline"} className="h-11 gap-2" aria-pressed={from === "home"} onClick={() => setFrom("home")}><MapPin className="h-4 w-4" aria-hidden="true" />Home</Button>
                      <Button type="button" variant={from === "here" ? "default" : "outline"} className="h-11" aria-pressed={from === "here"} onClick={() => { setFrom("here"); if (!here) locate(); }}>{geo === "asking" ? "Finding you…" : "Where I am now"}</Button>
                    </div>
                  ) : null}
                  {homeHere ? <p className="text-xs text-muted-foreground">{from === "home" ? "Using your saved home point. Nothing is asked of your phone." : here ? "Using where you are now." : "Allow location to use where you are now."}</p> : here && <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span>No home point yet. Use here as your home place?</span><Button type="button" variant="outline" size="sm" onClick={() => saveHome(here)} data-testid="save-home">Save as home place</Button></div>}
                </div>
              )}

              {!me ? (
                <Card data-testid="no-location"><CardContent className="space-y-2 p-4 text-center">
                  <MapPin className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
                  <p className="font-semibold">{geo === "denied" ? "Location is off" : "Use your location to see stores near you"}</p>
                  <p className="text-sm text-muted-foreground">{geo === "denied" ? "Allow location for this site in your browser settings, then try again. Meanwhile, here is the list at every store." : "Your position is used on this screen only. It is not saved."}</p>
                  <Button type="button" onClick={locate} disabled={geo === "asking"} className="gap-2"><Crosshair className="h-4 w-4" aria-hidden="true" />{geo === "asking" ? "Finding you…" : "Use my location"}</Button>
                </CardContent></Card>
              ) : (
                <StoreMap me={me} km={radius} pins={mapPins} />
              )}

              {headline && (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-100 to-emerald-50 p-3 dark:border-emerald-500/30 dark:from-emerald-500/20 dark:to-emerald-500/10" data-testid="best-verdict">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Cheapest for your list</p>
                  <p className="text-base font-extrabold">{headline.rival ? (headline.gap > 0 ? `${headline.store}, ${fmt(headline.gap)} less than ${headline.rival}` : `${headline.store} and ${headline.rival} cost the same`) : `${headline.store} prices the most of your list`}</p>
                  <p className="text-xs text-muted-foreground">{distMap.has(headline.store) ? `${(distMap.get(headline.store) as number).toFixed(1)} km away. ` : ""}{headline.rival ? `Compared on the ${headline.priced} item${headline.priced === 1 ? "" : "s"} both price.` : `${headline.priced} of ${headline.of} items priced.`}</p>
                </div>
              )}

              <div className="space-y-2" data-testid="store-ranking">
                {(me ? ranked : pricedAll).map((b, i) => {
                  const d = nearest(b.store);
                  const best = i === 0 && b.priced > 0;
                  const worst = (me ? ranked : pricedAll).length > 1 ? Math.max(...(me ? ranked : pricedAll).map((x) => x.total)) : 0;
                  return (
                    <Card key={b.store} className={best ? "border-2 border-emerald-600 bg-emerald-50/60 dark:bg-emerald-500/10" : ""} data-testid="store-card">
                      <CardContent className="p-0">
                        <button type="button" onClick={() => setOpen(open === b.store ? null : b.store)} aria-expanded={open === b.store} className="flex min-h-16 w-full items-center gap-3 p-3 text-left">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${best ? "bg-emerald-600" : "bg-primary"}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5"><b>{b.store}</b>{best && <span className={`${chip} bg-emerald-600 text-white`}>Best price</span>}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {d && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" aria-hidden="true" />{d.km.toFixed(1)} km</span>}
                              {b.level !== "nodata" && <Level level={b.level} pct={b.levelPct} />}
                              {sourceNote(b, now) && <span className={`${chip} bg-muted`}>{sourceNote(b, now)}</span>}
                              {b.unknown > 0 && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}>{b.priced} of {items.length} priced · {b.unknown} not counted</span>}
                              {b.old > 0 && <span className={`${chip} bg-muted`}>{b.old} old price{b.old === 1 ? "" : "s"}</span>}
                            </span>
                          </span>
                          <span className="shrink-0 text-right"><span className="block text-lg font-bold tabular-nums"><Money amount={b.total} currency={currency} /></span><span className="block text-xs text-muted-foreground">{best && worst > b.total ? `Saves ${fmt(worst - b.total)}` : b.extra > 0 ? `+${fmt(b.extra)}` : ""}</span></span>
                          {open === b.store ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        </button>
                        {open === b.store && (
                          <div className="space-y-1 border-t px-3 py-2 text-sm" data-testid="store-detail">
                            {b.lines.map((l) => (
                              <div key={l.key} className="flex justify-between gap-2"><span className="min-w-0 truncate">{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}{l.source === "community" && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">community</span>}{l.source === "online" && <span className="ml-1 text-xs text-sky-700 dark:text-sky-300">{l.similar ? "online, similar item" : "online"}</span>}{l.status === "old" && l.date && <span className="ml-1 text-xs text-muted-foreground">price from {l.date}</span>}</span><span className="shrink-0 tabular-nums">{l.total != null ? fmt(l.total) : "not counted"}</span></div>
                            ))}
                            {d && <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.loc.lat},${d.loc.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 pt-1 text-xs font-medium text-primary">Directions <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {me && ranked.length === 0 && <Alert>No store within {radius} km has a price for your list yet. Try a wider radius, or add store places below.</Alert>}
              </div>

              {split && <Alert data-testid="split-advice">Two stops can pay off: buying at {split.stores[1]} what is cheaper there saves about {fmt(split.saving)} after the trip, on top of {split.stores[0]}.</Alert>}
              {noPrice.length > 0 && (
                <Card data-testid="no-price-stores"><CardContent className="space-y-3 p-4">
                  <div><h2 className="text-base font-bold">No price for your list yet</h2><p className="text-sm text-muted-foreground">These stores are nearby but have no price for what is on your list, so they cannot be totalled.</p></div>
                  {noPrice.map((u) => (
                    <div key={u.store} className="flex items-center gap-3 border-t pt-3 first:border-0 first:pt-0" data-testid="no-price-store">
                      <div className="min-w-0 flex-1">
                        <b className="text-sm">{u.store}</b>
                        <p className="text-xs text-muted-foreground">{u.km != null ? `${u.km.toFixed(1)} km · ` : ""}No price for {u.missing.slice(0, 2).join(", ")}{u.missing.length > 2 ? ` and ${u.missing.length - 2} more` : ""}</p>
                        {levelWords(u.levelPct) && <span className={`${chip} mt-1 ${LEVEL_CLS[u.level]}`}>{u.levelPct != null && u.levelPct > 0 && u.level !== "average" ? "Usually " : ""}{levelWords(u.levelPct)}</span>}
                      </div>
                      <Link href="/personal/groceries/new" className="inline-flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-sm font-bold text-primary">Add a price</Link>
                    </div>
                  ))}
                </CardContent></Card>
              )}

              {grid && (
                <Card data-testid="item-grid"><CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 text-base font-bold">Item by item</h2>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted-foreground">Only items that differ
                      <input type="checkbox" role="switch" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="h-5 w-5 accent-primary" />
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <caption className="sr-only">Price of each item at each store, in {currency}</caption>
                      <thead><tr><th scope="col" className="w-[34%] pb-1 text-left text-xs font-semibold text-muted-foreground"><span className="sr-only">Item</span></th>{grid.stores.map((st) => <th key={st} scope="col" className="px-1 pb-1 text-center text-xs font-bold leading-tight">{st}</th>)}</tr></thead>
                      <tbody>
                        {grid.rows.filter((r) => !onlyDiff || r.differs).map((r) => (
                          <tr key={r.key} className="border-t" data-testid="grid-row">
                            <th scope="row" className="py-2 pr-1 text-left text-[13px] font-semibold leading-tight">{r.qty > 1 ? `${r.qty} × ` : ""}{r.name}</th>
                            {r.cells.map((c, ci) => <td key={ci} className={`min-h-11 px-1 py-2 text-center tabular-nums ${r.cheapest.includes(ci) ? "bg-emerald-100 font-extrabold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : c == null ? "text-xs text-muted-foreground" : ""}`}>{c == null ? "No price" : c.toFixed(2)}</td>)}
                          </tr>
                        ))}
                        {grid.sharedCount > 0 && <tr className="border-t-2" data-testid="grid-total"><th scope="row" className="py-2 pr-1 text-left text-[13px] font-extrabold leading-tight">Total, {grid.sharedCount} shared item{grid.sharedCount === 1 ? "" : "s"}</th>{grid.totals.map((t, ci) => <td key={ci} className={`px-1 py-2 text-center font-bold tabular-nums ${grid.leader?.index === ci ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : ""}`}>{t.toFixed(2)}</td>)}</tr>}
                        <tr className="border-t"><th scope="row" className="py-2 pr-1 text-left text-[13px] font-semibold">Items priced</th>{grid.priced.map((n, ci) => <td key={ci} className="px-1 py-2 text-center tabular-nums">{n} of {items.length}</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">{grid.allShared ? "Every store prices every item." : `The total uses only the ${grid.sharedCount} item${grid.sharedCount === 1 ? "" : "s"} every store prices, so a store is never ahead only because it is missing items.`} Green is the cheapest price in each row.{grid.leader ? ` ${grid.stores[grid.leader.index]} is cheapest by ${fmt(grid.leader.gap)}.` : ""}</p>
                </CardContent></Card>
              )}

              {me && far.length > 0 && <p className="text-xs text-muted-foreground">{far.length} more store{far.length === 1 ? " is" : "s are"} outside {radius} km: {far.map((f) => f.store).join(", ")}.</p>}

              {(unplaced.length > 0 || me) && (
                <Card data-testid="store-places"><CardContent className="space-y-3 p-4">
                  <h2 className={heading}>Store places</h2>
                  {unplaced.length > 0 && <p className="text-sm text-muted-foreground">{here ? "Standing at one of these? Pin it, and it joins the map." : "These stores have no place yet. Turn on your location while you are there to pin them."}</p>}
                  {unplaced.map((b) => <div key={b.store} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{b.store}</span>{here && <Button type="button" variant="outline" size="sm" onClick={() => addLoc(b.store, here, "pin")}>Pin here</Button>}</div>)}
                  {busy && <p className="text-xs text-muted-foreground">Loading supermarkets around you…</p>}
                  {known.length > 0 && <p className="text-[11px] text-muted-foreground" data-testid="osm-results">{known.length} supermarkets known. Map data © OpenStreetMap contributors.</p>}
                </CardContent></Card>
              )}

              <Card data-testid="price-level"><CardContent className="space-y-3 p-4">
                <h2 className={heading}>Price level</h2>
                <p className="text-sm text-muted-foreground">How each store compares with the average store, cheapest first. Based on products you bought or saw in 2 or more stores.</p>
                {levels.rated.map((s) => (
                  <div key={s.store} className="space-y-1 border-t pt-2 first:border-0 first:pt-0" data-testid="level-row">
                    <div className="flex items-center justify-between gap-2"><b className="text-sm">{s.store}</b><Level level={s.level} pct={null} /></div>
                    {s.pct != null ? <div className="flex items-center gap-2"><div className="relative h-4 flex-1 rounded bg-muted" aria-hidden="true"><div className={`absolute top-0 h-full ${s.pct < 0 ? "rounded-l bg-emerald-600" : s.pct >= 3 ? "rounded-r bg-red-600" : s.pct > 2 ? "rounded-r bg-amber-500" : "rounded-r bg-slate-400"}`} style={s.pct < 0 ? { right: "50%", width: `${Math.min(50, Math.abs(s.pct) * 8)}%` } : { left: "50%", width: `${Math.min(50, s.pct * 8)}%` }} /><div className="absolute left-1/2 top-[-2px] h-[20px] w-0.5 bg-foreground/60" /></div><b className="w-14 text-right text-sm tabular-nums">{signed(s.pct)}</b></div> : null}
                    <p className="text-[11px] text-muted-foreground">{s.shared} products compared{s.listNote ? ` · On your list: ${s.listNote}` : ""}</p>
                  </div>
                ))}
                {levels.needMore.length > 0 && (
                  <details className="border-t pt-2" data-testid="level-need-more">
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-bold">Needs more prices<ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
                    <p className="pb-2 text-xs text-muted-foreground">These stores share too few products to be rated yet.</p>
                    {levels.needMore.map((s) => (
                      <div key={s.store} className="space-y-1 border-t py-2">
                        <div className="flex justify-between gap-2 text-sm"><b>{s.store}</b><span className="text-xs text-muted-foreground">{s.shared} of {levels.minShared} shared products</span></div>
                        <div className="h-1.5 rounded bg-muted" aria-hidden="true"><div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, (s.shared / levels.minShared) * 100)}%` }} /></div>
                        {s.listNote && <p className="text-[11px] text-muted-foreground">On your list: {s.listNote}</p>}
                      </div>
                    ))}
                  </details>
                )}
                <div className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Each price is compared with the middle price of the same product and size across stores, newer than 60 days, then weighted by what you spend. Needs 5 shared products. Cheapest and Most expensive need a 3% gap from average. Loyalty discounts are not included.</span></div>
              </CardContent></Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
