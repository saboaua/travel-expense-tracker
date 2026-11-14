"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronDown, ChevronUp, Crosshair, ExternalLink, Info, MapPin, Minus, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MapPin as Pin } from "@/components/personal/StoreMap";
import { OfflineNotice } from "@/components/OfflineNotice";
import { createClient } from "@/lib/supabase/client";
import { fetchPrices, pricesKey, fetchPriceMatches, priceMatchesKey } from "@/lib/offline-grocery";
import { fetchAll } from "@/lib/personal/fetch-all";
import { useCachedQuery } from "@/lib/use-cached-query";
import { buildProducts, type MatchDecision } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { RADII, basketTotals, bestStoreFor, distanceKm, LEVEL_LABEL, sameStore, splitAdvice, storeIndex, usualItems, type Level, type LatLng, type ListItem } from "@/lib/personal/basket";
import { formatCurrency } from "@/lib/utils";

const StoreMap = dynamic(() => import("@/components/personal/StoreMap"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-xl border bg-muted" aria-label="Loading map" /> });

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
  const prices = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matches = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const listQ = useCachedQuery<ListRow[]>((uid) => `${uid}:basket:list`, async (sb) => { const r = await sb.from("shopping_list_items").select("id, product_key, name, qty").order("created_at"); return { data: (r.data ?? []) as ListRow[], error: r.error }; }, []);
  const locQ = useCachedQuery<Loc[]>((uid) => `${uid}:basket:locs`, async (sb) => { const r = await sb.from("store_locations").select("id, name, lat, lng, source"); return { data: (r.data ?? []) as Loc[], error: r.error }; }, []);

  const placesQ = useCachedQuery<Osm[]>((uid) => `${uid}:basket:places`, async (sb) => {
    try {
      const rows = await fetchAll<{ id: string; name: string; lat: number; lng: number }>((a, b) => sb.from("supermarket_places").select("id, name, lat, lng").order("id").range(a, b));
      return { data: rows.map((r) => ({ osmId: `place/${r.id}`, name: r.name, lat: r.lat, lng: r.lng })), error: null };
    } catch { return { data: [] as Osm[], error: null }; } // the table is not there until the migration has been run
  }, []);

  const [radius, setRadius] = useState<number>(5);
  const [here, setHere] = useState<LatLng | null>(null);
  const [home, setHome] = useState<LatLng | null>(null);
  const [from, setFrom] = useState<"home" | "here">("home");
  const origin = from === "home" && home ? home : here ?? home;
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
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [products]);
  const fmt = useCallback((n: number) => formatCurrency(n, currency), [currency]);
  const inCur = useMemo(() => products.filter((p) => p.currency === currency), [products, currency]);

  const list = useMemo<ListRow[]>(() => (listQ.data ?? []).filter((l) => inCur.some((p) => p.key === l.product_key)), [listQ.data, inCur]);
  const items: ListItem[] = useMemo(() => list.map((l) => ({ key: l.product_key, qty: l.qty })), [list]);
  const usual = useMemo(() => usualItems(inCur, currency, now).filter((u) => !list.some((l) => l.product_key === u.key)), [inCur, currency, now, list]);
  const stores = useMemo(() => [...new Set(inCur.flatMap((p) => p.stores.map((s) => s.store)))], [inCur]);
  const index = useMemo(() => storeIndex(inCur, currency, now), [inCur, currency, now]);
  const baskets = useMemo(() => basketTotals(items, inCur, stores, index, now), [items, inCur, stores, index, now]);

  const locs = useMemo(() => locQ.data ?? [], [locQ.data]);
  const nearest = useCallback((store: string): { km: number; loc: Loc } | null => {
    if (!me) return null;
    let best: { km: number; loc: Loc } | null = null;
    for (const l of locs) if (sameStore(l.name, store)) { const km = distanceKm(me, l); if (!best || km < best.km) best = { km, loc: l }; }
    return best;
  }, [me, locs]);

  const ranked = baskets.filter((b) => { const d = nearest(b.store); return d && d.km <= radius; });
  const unplaced = baskets.filter((b) => !locs.some((l) => sameStore(l.name, b.store)));
  const far = baskets.filter((b) => { const d = nearest(b.store); return d && d.km > radius; });
  const distMap = useMemo(() => new Map(baskets.flatMap((b) => { const d = nearest(b.store); return d ? [[b.store, d.km] as [string, number]] : []; })), [baskets, nearest]);
  const priced = useMemo(() => ranked.filter((b) => b.priced > 0), [ranked]);
  const split = useMemo(() => splitAdvice(items, ranked, distMap), [items, inCur, ranked, distMap]);

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
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeo("idle"); },
      () => setGeo("denied"),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);
  useEffect(() => {
    // Only look straight away when the person has already allowed it; otherwise they tap the button
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
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <Link href="/personal/groceries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groceries</Link>
        <h1 className="mt-1 text-2xl font-bold">Best store for your list</h1>
        <p className="text-sm text-muted-foreground">{list.length} item{list.length === 1 ? "" : "s"}{me && ranked.length ? ` · ${ranked.length} store${ranked.length === 1 ? "" : "s"} within ${radius} km` : ""}</p>
      </div>
      <OfflineNotice savedAt={prices.savedAt} />
      {(prices.error || msg) && <Alert variant={msg && !prices.error ? "info" : "error"}>{prices.error || msg}</Alert>}

      {noReceipts ? (
        <Card><CardContent className="space-y-2 p-5 text-center"><ShoppingBasket className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" /><p className="font-semibold">Scan a few receipts first</p><p className="text-sm text-muted-foreground">Your list is priced from what you paid. The more stores you have receipts from, the better the answer.</p><Link href="/personal/groceries/new"><Button>Scan a receipt</Button></Link></CardContent></Card>
      ) : (
        <>
          <Card data-testid="shopping-list"><CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between"><h2 className={heading}>Your list</h2>{list.length > 0 && <button type="button" onClick={clearList} className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><Trash2 className="h-3 w-3" aria-hidden="true" /> Clear</button>}</div>
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

              {(home || here) && (
                <div className="space-y-1.5" data-testid="origin">
                  <p className={heading}>Measure distance from</p>
                  {home ? (
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Measure distance from">
                      <Button type="button" variant={from === "home" ? "default" : "outline"} className="h-11 gap-2" aria-pressed={from === "home"} onClick={() => setFrom("home")}><MapPin className="h-4 w-4" aria-hidden="true" />Home</Button>
                      <Button type="button" variant={from === "here" ? "default" : "outline"} className="h-11" aria-pressed={from === "here"} onClick={() => { setFrom("here"); if (!here) locate(); }}>{geo === "asking" ? "Finding you…" : "Where I am now"}</Button>
                    </div>
                  ) : null}
                  {home ? <p className="text-xs text-muted-foreground">{from === "home" ? "Using your saved home point. Nothing is asked of your phone." : here ? "Using where you are now." : "Allow location to use where you are now."}</p> : here && <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span>No home point yet. Use here as your home place?</span><Button type="button" variant="outline" size="sm" onClick={() => saveHome(here)} data-testid="save-home">Save as home place</Button></div>}
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

              <div className="space-y-2" data-testid="store-ranking">
                {(me ? ranked : baskets).map((b, i) => {
                  const d = nearest(b.store);
                  const best = i === 0 && b.priced > 0;
                  const worst = (me ? ranked : baskets).length > 1 ? Math.max(...(me ? ranked : baskets).map((x) => x.total)) : 0;
                  return (
                    <Card key={b.store} className={best ? "border-2 border-emerald-600 bg-emerald-50/60 dark:bg-emerald-500/10" : ""} data-testid="store-card">
                      <CardContent className="p-0">
                        <button type="button" onClick={() => setOpen(open === b.store ? null : b.store)} aria-expanded={open === b.store} className="flex min-h-16 w-full items-center gap-3 p-3 text-left">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${best ? "bg-emerald-600" : "bg-primary"}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5"><b>{b.store}</b>{best && <span className={`${chip} bg-emerald-600 text-white`}>Best price</span>}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {d && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" aria-hidden="true" />{d.km.toFixed(1)} km</span>}
                              <Level level={b.level} pct={b.levelPct} />
                              {b.estimated > 0 || b.unknown > 0 ? <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}>{b.priced} of {items.length} priced{b.estimated ? ` · ${b.estimated} estimated` : ""}</span> : <span className={`${chip} bg-muted`}>All items priced</span>}
                              {b.old > 0 && <span className={`${chip} bg-muted`}>{b.old} old price{b.old === 1 ? "" : "s"}</span>}
                            </span>
                          </span>
                          <span className="shrink-0 text-right"><span className="block text-lg font-bold tabular-nums">{fmt(b.total)}</span><span className="block text-xs text-muted-foreground">{best && worst > b.total ? `Saves ${fmt(worst - b.total)}` : b.extra > 0 ? `+${fmt(b.extra)}` : ""}</span></span>
                          {open === b.store ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        </button>
                        {open === b.store && (
                          <div className="space-y-1 border-t px-3 py-2 text-sm" data-testid="store-detail">
                            {b.lines.map((l) => (
                              <div key={l.key} className="flex justify-between gap-2"><span className="min-w-0 truncate">{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}{l.status === "estimated" && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">estimated</span>}{l.status === "old" && l.date && <span className="ml-1 text-xs text-muted-foreground">price from {l.date}</span>}</span><span className="shrink-0 tabular-nums">{l.total != null ? fmt(l.total) : "no price"}</span></div>
                            ))}
                            {d && <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.loc.lat},${d.loc.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 pt-1 text-xs font-medium text-primary">Directions <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {me && ranked.length === 0 && <Alert>No stores with a known place within {radius} km. Try a wider radius, or add store places below.</Alert>}
              </div>

              {split && <Alert data-testid="split-advice">Two stops can pay off: buying at {split.stores[1]} what is cheaper there saves about {fmt(split.saving)} after the trip, on top of {split.stores[0]}.</Alert>}
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
                <p className="text-sm text-muted-foreground">How each store compares with the average store, on products you bought or saw in 2 or more stores.</p>
                {index.map((s) => (
                  <div key={s.store} className="space-y-1 border-t pt-2 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2"><b className="text-sm">{s.store}</b><Level level={s.level} pct={null} /></div>
                    {s.pct != null ? <div className="flex items-center gap-2"><div className="relative h-4 flex-1 rounded bg-muted" aria-hidden="true"><div className={`absolute top-0 h-full ${s.pct < 0 ? "rounded-l bg-emerald-600" : s.pct >= 3 ? "rounded-r bg-red-600" : s.pct > 2 ? "rounded-r bg-amber-500" : "rounded-r bg-slate-400"}`} style={s.pct < 0 ? { right: "50%", width: `${Math.min(50, Math.abs(s.pct) * 8)}%` } : { left: "50%", width: `${Math.min(50, s.pct * 8)}%` }} /><div className="absolute left-1/2 top-[-2px] h-[20px] w-0.5 bg-foreground/60" /></div><b className="w-14 text-right text-sm tabular-nums">{signed(s.pct)}</b></div> : <p className="text-xs text-muted-foreground">Not enough data: {s.shared} of {5} shared products so far.</p>}
                    <p className="text-[11px] text-muted-foreground">{s.shared} products compared</p>
                  </div>
                ))}
                <div className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Each price is compared with the middle price of the same product and size across stores, newer than 60 days, then weighted by what you spend. Needs 5 shared products. Cheapest and Most expensive need a 3% gap from average. Loyalty discounts are not included.</span></div>
              </CardContent></Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
