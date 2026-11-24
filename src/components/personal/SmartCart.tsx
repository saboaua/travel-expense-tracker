"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Car, Check, Crosshair, Crown, Lock, MapPin, Minus, Navigation, Plus, Settings, ShoppingCart } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/page-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PAGE_WIDTH } from "@/components/layout/PageShell";
import { OfflineNotice } from "@/components/OfflineNotice";
import { usePro } from "@/lib/use-pro";
import { directionsUrl, everyText, type Plan, type PlanLine, type StoreRow } from "@/lib/personal/smart-cart";
import { useSmartCart } from "@/components/personal/use-smart-cart";

const StoreMap = dynamic(() => import("@/components/personal/StoreMap"), { ssr: false, loading: () => <div className="h-56 w-full animate-pulse rounded-xl border bg-muted" aria-label="Loading map" /> });

const GREEN = "text-emerald-700 dark:text-emerald-300";
const pill = "inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold";
const SOURCE: Record<string, string> = { own: "Your receipt", community: "Community", online: "Online list" };
const SOURCE_CLS: Record<string, string> = { own: "bg-muted text-muted-foreground", community: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200", online: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200" };
const ProBadge = () => <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-extrabold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">PRO</span>;

function Header({ pro, onSettings }: { pro: boolean; onSettings?: () => void }) {
  return (
    <div className="space-y-3">
      <BackLink href="/personal/groceries">Groceries</BackLink>
      <div className="flex items-center gap-3">
        <IconTile tone="groceries" color="#16a34a" className="h-11 w-11"><ShoppingCart className="h-6 w-6" /></IconTile>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-bold leading-tight md:text-3xl">Smart Cart</h1><p className="text-sm text-muted-foreground">Built from what you buy most</p></div>
        {pro && <ProBadge />}
        {onSettings && <button type="button" onClick={onSettings} aria-label="Smart Cart settings" data-testid="sc-settings-open" className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card text-muted-foreground hover:bg-muted"><Settings className="h-5 w-5" aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

function Tag({ line }: { line: PlanLine }) {
  return <span className="inline-flex flex-wrap gap-1"><span className={`${pill} ${SOURCE_CLS[line.source ?? "own"]}`}>{SOURCE[line.source ?? "own"]}</span>{line.similar && <span className={`${pill} bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}>Similar item</span>}{line.old && <span className={`${pill} bg-muted text-muted-foreground`}>Old price</span>}</span>;
}

function Lines({ lines, currency }: { lines: PlanLine[]; currency: string }) {
  return (
    <ul className="divide-y">
      {lines.map((l) => (
        <li key={l.key} className="flex items-center gap-3 py-2 text-sm" data-testid="sc-line">
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{l.qty > 1 ? `${l.qty} × ` : ""}{l.name}</span><Tag line={l} /></span>
          <span className="shrink-0 text-right"><Money amount={l.total} currency={currency} className="text-sm" />{l.saving != null && Math.abs(l.saving) >= 0.01 && <span className={`block text-xs font-bold ${l.saving > 0 ? GREEN : "text-red-700 dark:text-red-300"}`}>{l.saving > 0 ? "saves" : "costs"} <Money amount={Math.abs(l.saving)} currency={currency} className="text-xs" /></span>}</span>
        </li>
      ))}
    </ul>
  );
}

function planTitle(p: Plan, i: number): string {
  if (p.stops.length === 1) return `One stop: ${p.stops[0].store}`;
  return i === 1 ? `Smart split: ${p.stops.length} stops` : `${p.stops.length} stops`;
}

export function SmartCart() {
  const pro = usePro();
  const sc = useSmartCart();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ store: string; at: { lat: number; lng: number } | null; km: number | null; lines: PlanLine[]; total: number; saving: number | null } | null>(null);
  const { currency, plan, rows, settings } = sc;

  const driving = settings.includeDriving && plan.plans.length > 0;
  const shown = pick != null && plan.plans[pick] ? pick : plan.best >= 0 ? plan.best : 0;
  const current: Plan | undefined = plan.plans[shown];
  const covered = useMemo(() => new Set(rows.flatMap((r) => r.lines.map((l) => l.key))), [rows]);
  const missing = sc.items.filter((i) => !covered.has(i.key)).length;
  useEffect(() => { setPick(null); }, [sc.items.length, settings.includeDriving]);

  if (pro === null || (pro && sc.loading)) {
    return <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-28 md:p-8`} aria-busy="true"><Header pro={false} /><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  }

  if (!pro) {
    return (
      <div className={`${PAGE_WIDTH.form} space-y-4 p-4 pb-28 md:p-8`} data-testid="sc-free">
        <Header pro={false} />
        <div className="relative overflow-hidden rounded-2xl" aria-hidden="true">
          <div className="pointer-events-none space-y-3 opacity-70 blur-[5px]">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Your usual cart, 14 items</p><p className="text-3xl font-extrabold text-emerald-900">186.40</p><p className="text-sm text-emerald-800">You could save 22.60 a trip.</p></div>
            <div className="rounded-2xl border-2 border-primary bg-card p-4"><p className="font-bold">Smart split: 2 stops</p><p className="text-sm text-muted-foreground">Example only</p></div>
          </div>
        </div>
        <Card><CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-3"><IconTile tone="groceries" color="#d97706" className="h-10 w-10"><Lock className="h-5 w-5" /></IconTile><p className="text-lg font-bold">Smart Cart is a Pro feature</p></div>
          <p className="text-sm text-muted-foreground">It learns what you buy and how often, builds your usual cart, and shows which stores save you the most, after the cost of driving there.</p>
          <Link href="/personal/pro" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="sc-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>
        </CardContent></Card>
      </div>
    );
  }

  if (sc.noReceipts || !sc.progress.ready) {
    const pct = Math.min(100, Math.round((sc.progress.purchases / sc.progress.needed) * 100));
    return (
      <div className={`${PAGE_WIDTH.form} space-y-4 p-4 pb-28 md:p-8`} data-testid="sc-learning">
        <Header pro />
        <OfflineNotice savedAt={sc.savedAt} />
        {sc.error && <Alert variant="error">{sc.error}</Alert>}
        <Card><CardContent className="space-y-3 p-5">
          <p className="text-lg font-bold">Your Smart Cart is learning</p>
          <p className="text-sm text-muted-foreground">It builds from your grocery receipts, and needs things you buy more than once. {sc.noReceipts ? "Scan a grocery receipt to start." : `${Math.min(sc.progress.purchases, sc.progress.needed)} of about ${sc.progress.needed} purchases so far.`}</p>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Smart Cart is learning"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div>
          <Link href="/personal/groceries/new" className="block"><Button className="h-11 w-full">Scan a grocery receipt</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  const bestRow = rows[0];
  const bestPlan = plan.best >= 0 ? plan.plans[plan.best] : null;
  const openStore = (r: { store: string; at: { lat: number; lng: number } | null; km: number | null; lines: PlanLine[]; total: number; saving: number | null }) => setSheet(r);

  const hero = driving && bestPlan
    ? <><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Your usual cart, {sc.items.length} item{sc.items.length === 1 ? "" : "s"}</p>
        <p className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-100"><Money amount={bestPlan.itemsTotal} currency={currency} /> <span className="text-sm font-bold">at the best price</span></p>
        <p className="text-sm text-emerald-800 dark:text-emerald-200">{plan.usualTotal > 0 && sc.usual ? <>vs <Money amount={plan.usualTotal} currency={currency} className="text-sm" /> at {sc.usual}. </> : null}You could save <b><Money amount={bestPlan.net} currency={currency} className="text-sm" /></b> a trip.</p></>
    : driving
      ? <><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Your usual cart, {sc.items.length} item{sc.items.length === 1 ? "" : "s"}</p>
          <p className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100">{sc.usual ? `${sc.usual} is already your best choice` : "No trip saves you enough"}</p>
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Another store is cheaper, but not by more than the drive costs.</p></>
      : bestRow
        ? <><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Your usual cart, {sc.items.length} item{sc.items.length === 1 ? "" : "s"}</p>
            <p className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-100"><Money amount={bestRow.total} currency={currency} /> <span className="text-sm font-bold">at the cheapest</span></p>
            <p className="text-sm text-emerald-800 dark:text-emerald-200">{bestRow.vsUsual != null && bestRow.vsUsual < 0 ? <>The cheapest is <b><Money amount={-bestRow.vsUsual} currency={currency} className="text-sm" /></b> less than your usual store.</> : "Prices from your receipts, the community and online lists."}</p></>
        : <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">No store has a price for your cart yet.</p>;

  return (
    <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-28 md:p-8`} data-testid="smart-cart">
      <Header pro onSettings={() => setSettingsOpen(true)} />
      <OfflineNotice savedAt={sc.savedAt} />
      {sc.error && <Alert variant="error">{sc.error}</Alert>}

      <div className="space-y-4 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
        {/* the cart */}
        <div className="space-y-4 lg:order-1">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-100 to-emerald-50 p-4 dark:border-emerald-500/30 dark:from-emerald-500/20 dark:to-emerald-500/5 lg:hidden" data-testid="sc-hero">{hero}</div>
          <Card><CardContent className="p-4" data-testid="sc-cart">
            <div className="flex items-baseline justify-between"><h2 className="text-base font-bold">Your usual cart</h2><span className="text-xs text-muted-foreground">{sc.items.length} of {sc.habits.length} in</span></div>
            <ul className="mt-1 divide-y">
              {sc.habits.map((h) => {
                const on = !sc.off.includes(h.key);
                const q = sc.qty[h.key] ?? h.qty;
                return (
                  <li key={h.key} className="flex items-center gap-3 py-2" data-testid="sc-cart-row">
                    <button type="button" role="checkbox" aria-checked={on} aria-label={`${on ? "Leave out" : "Add"} ${h.name}`} onClick={() => sc.toggle(h.key)} className="flex h-11 w-9 shrink-0 items-center justify-center"><span className={`flex h-6 w-6 items-center justify-center rounded-md ${on ? "bg-primary text-primary-foreground" : "border-2 border-border bg-background"}`}>{on && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}</span></button>
                    <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${on ? "" : "text-muted-foreground"}`}>{h.name}</span><span className="block text-xs text-muted-foreground">{everyText(h.everyDays)} · {h.count} times</span></span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`Less ${h.name}`} disabled={!on || q <= 1} onClick={() => sc.setQty(h.key, q - 1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{q}</span>
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`More ${h.name}`} disabled={!on} onClick={() => sc.setQty(h.key, q + 1)}><Plus className="h-3 w-3" /></Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent></Card>
        </div>

        {/* where to buy it */}
        <div className="space-y-4 lg:order-2">
          <div className="hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-100 to-emerald-50 p-4 dark:border-emerald-500/30 dark:from-emerald-500/20 dark:to-emerald-500/5 lg:block" data-testid="sc-hero-wide">{hero}</div>

          <div className="flex min-h-[60px] items-center gap-3 rounded-2xl border bg-card px-4 py-2">
            <Car className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold">Include driving cost</p><p className="text-xs text-muted-foreground">{settings.includeDriving ? `Savings are shown after fuel (${currency} ${settings.perKm.toFixed(2)} per km)` : "Showing every supermarket. You decide if it is worth the trip"}</p></div>
            <Switch checked={settings.includeDriving} onChange={(v) => sc.setSettings({ includeDriving: v })} label="Include driving cost" />
          </div>

          {!sc.origin && (
            <Card data-testid="sc-no-location"><CardContent className="space-y-2 p-4 text-center">
              <MapPin className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">{sc.geo === "denied" ? "Location is off" : "Use your location to see trips"}</p>
              <p className="text-sm text-muted-foreground">{sc.geo === "denied" ? "Allow location for this site in your browser settings, or save a home point in Best Prices. Meanwhile, here is your cart at every store." : "Distances and driving cost start from where you are, or your saved home point. It is used on this screen only."}</p>
              <Button type="button" onClick={sc.locate} disabled={sc.geo === "asking"} className="gap-2"><Crosshair className="h-4 w-4" aria-hidden="true" />{sc.geo === "asking" ? "Finding you…" : "Use my location"}</Button>
            </CardContent></Card>
          )}
          {sc.origin && sc.homeHere && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Measure distance from">
              <Button type="button" variant={sc.from === "home" ? "default" : "outline"} className="h-11 gap-2" aria-pressed={sc.from === "home"} onClick={() => sc.setFrom("home")}><MapPin className="h-4 w-4" aria-hidden="true" />Home</Button>
              <Button type="button" variant={sc.from === "here" ? "default" : "outline"} className="h-11" aria-pressed={sc.from === "here"} onClick={() => { sc.setFrom("here"); if (!sc.here) sc.locate(); }}>{sc.geo === "asking" ? "Finding you…" : "Where I am now"}</Button>
            </div>
          )}

          {!sc.externalReady && <p className="text-xs text-muted-foreground" aria-live="polite">Looking up community and online prices…</p>}
          {missing > 0 && sc.externalReady && <p className="text-xs text-muted-foreground" data-testid="sc-missing">{missing} item{missing === 1 ? " has" : "s have"} no real price at any store yet, so {missing === 1 ? "it is" : "they are"} left out.</p>}

          {driving ? (
            <div className="space-y-3" data-testid="sc-plans">
              <h2 className="text-base font-bold">Where to buy it</h2>
              {plan.plans.map((p, i) => (
                <button key={i} type="button" onClick={() => setPick(i)} aria-pressed={i === shown} data-testid="sc-plan" className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${i === shown ? "border-2 border-primary bg-primary/5" : "bg-card"}`}>
                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="text-[15px] font-extrabold">{planTitle(p, i)}</span>{i === plan.best && <span className={`${pill} bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200`}>Best</span>}</span>
                    <span className="block text-xs text-muted-foreground">{p.stops.length === 1 ? `${p.stops[0].km.toFixed(1)} km` : p.stops.map((s) => s.store).join(" + ")}</span></span>
                  <span className="shrink-0 text-right">{p.net > 0.005 ? <span className={`block text-base font-extrabold ${GREEN}`}>Save <Money amount={p.net} currency={currency} className="text-base" /></span> : <span className="block text-sm font-bold text-muted-foreground">No saving</span>}<span className="block text-xs text-muted-foreground">{i === 0 ? `${p.km.toFixed(1)} km round trip` : "after driving"}</span></span>
                </button>
              ))}
              {current && (
                <div className="space-y-3" data-testid="sc-plan-detail">
                  <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-card p-3 text-center">
                    <div><p className="text-xs text-muted-foreground">Items</p><Money amount={current.itemsTotal} currency={currency} className="text-base" /></div>
                    <div><p className="text-xs text-muted-foreground">Extra driving</p><span className="text-base font-extrabold tabular-nums">{current.driving > 0 ? "−" : ""}<Money amount={current.driving} currency={currency} className="text-base" /></span></div>
                    <div><p className="text-xs text-muted-foreground">You save</p><span className={`text-base ${current.net > 0 ? GREEN : ""}`}><Money amount={Math.max(0, current.net)} currency={currency} className="text-base" /></span></div>
                  </div>
                  {current.stops.map((s) => (
                    <Card key={s.store} data-testid="sc-stop"><CardContent className="p-4">
                      <button type="button" onClick={() => openStore({ store: s.store, at: s.at, km: s.km, lines: s.lines, total: s.total, saving: s.saving })} className="flex w-full items-center gap-3 text-left" aria-label={`${s.store}, show on the map`} data-testid="sc-stop-open">
                        <IconTile tone="groceries" color="#16a34a" className="h-10 w-10"><ShoppingCart className="h-5 w-5" /></IconTile>
                        <span className="min-w-0 flex-1"><span className="block font-extrabold text-primary">{s.store}</span><span className="block text-xs text-muted-foreground">{s.km.toFixed(1)} km</span></span>
                        <Money amount={s.total} currency={currency} className="text-base" />
                      </button>
                      <div className="mt-2"><Lines lines={s.lines} currency={currency} /></div>
                    </CardContent></Card>
                  ))}
                  <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Extra stops only show up when they save more than the drive costs ({currency} {settings.perKm.toFixed(2)} per km, there and back, with an allowance for roads). Change this in Settings.</p>
                  {(() => { const u = directionsUrl(sc.origin, current.stops.map((s) => s.at)); return u ? <a href={u} target="_blank" rel="noopener noreferrer" data-testid="sc-route" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground"><Navigation className="h-5 w-5" aria-hidden="true" />{current.stops.length > 1 ? "Route with all stops" : "Directions in Google Maps"}</a> : null; })()}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2" data-testid="sc-stores">
              <h2 className="text-base font-bold">Your cart at each supermarket</h2>
              <p className="text-xs text-muted-foreground">{settings.includeDriving ? "No store places are saved yet, so trips cannot be planned. Open Best Prices near a store to save it." : "The store that prices most of your cart comes first, then the lowest price. Tap a store for its items, the map and directions."}</p>
              {rows.map((r: StoreRow, i) => (
                <button key={r.store} type="button" onClick={() => openStore({ store: r.store, at: r.at, km: r.km, lines: r.lines, total: r.total, saving: r.vsUsual != null ? -r.vsUsual : null })} data-testid="sc-store-row" className={`flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left ${i === 0 && rows.length > 1 ? "border-2 border-emerald-600" : ""}`}>
                  <IconTile tone="groceries" color="#16a34a" className="h-10 w-10"><ShoppingCart className="h-5 w-5" /></IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5"><span className="font-extrabold text-primary">{r.store}</span>{i === 0 && rows.length > 1 && <span className={`${pill} bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200`}>Cheapest</span>}</span>
                    <span className="block text-xs text-muted-foreground">{r.km != null ? `${r.km.toFixed(1)} km · ` : ""}{r.priced} of {sc.items.length} items priced</span>
                    {r.unpriced > 0 && <span className={`${pill} mt-1 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}>{r.unpriced} item{r.unpriced === 1 ? "" : "s"} not priced here</span>}
                  </span>
                  <span className="shrink-0 text-right"><Money amount={r.total} currency={currency} className="text-base" />
                    <span className={`block text-xs font-bold ${r.usual ? "text-muted-foreground" : r.vsUsual != null && r.vsUsual < 0 ? GREEN : r.vsUsual != null && r.vsUsual > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{r.usual ? "Usual store" : r.vsUsual == null ? "" : r.vsUsual < 0 ? <><Money amount={-r.vsUsual} currency={currency} className="text-xs" /> less</> : r.vsUsual > 0 ? <><Money amount={r.vsUsual} currency={currency} className="text-xs" /> more</> : "Same"}</span></span>
                </button>
              ))}
              {rows.length === 0 && <Alert>No store has a price for your cart yet. Prices come from your receipts, community prices and online lists.</Alert>}
              <p className="text-xs text-muted-foreground">Distance is shown but not charged. Turn on Include driving cost to see savings after fuel.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Prices come from your receipts, the community and online lists. Items with no real price are left out, never guessed.</p>
        </div>
      </div>

      {sheet && (
        <BottomSheet title={sheet.store} onClose={() => setSheet(null)} testId="sc-store-sheet" tall>
          <div className="space-y-3">
            {sheet.at ? (
              <>
                <StoreMap me={sc.origin ?? sheet.at} km={Math.max(1, Math.ceil(sc.origin ? Math.hypot((sc.origin.lat - sheet.at.lat) * 111, (sc.origin.lng - sheet.at.lng) * 108) : 1))} pins={[{ lat: sheet.at.lat, lng: sheet.at.lng, name: sheet.store, n: 1, best: true, label: sheet.store }]} />
                <p className="text-sm text-muted-foreground">{sheet.km != null ? `${sheet.km.toFixed(1)} km by road, about ${Math.max(1, Math.round((sheet.km / 35) * 60))} min by car. ` : ""}{sheet.lines.length} item{sheet.lines.length === 1 ? "" : "s"} here, <Money amount={sheet.total} currency={currency} className="text-sm" />{sheet.saving != null && sheet.saving > 0.005 ? <> — you save <b className={GREEN}><Money amount={sheet.saving} currency={currency} className="text-sm" /></b> on this stop.</> : "."}</p>
                {(() => { const u = directionsUrl(sc.origin, [sheet.at]); return u ? <a href={u} target="_blank" rel="noopener noreferrer" data-testid="sc-directions" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground"><Navigation className="h-5 w-5" aria-hidden="true" />Directions in Google Maps</a> : null; })()}
              </>
            ) : (
              <Alert variant="info">No place is saved for this store yet. Open <Link href="/personal/groceries/basket" className="font-semibold underline">Best Prices</Link> while you are near it to save it.</Alert>
            )}
            <Lines lines={sheet.lines} currency={currency} />
          </div>
        </BottomSheet>
      )}

      {settingsOpen && (
        <BottomSheet title="Smart Cart settings" onClose={() => setSettingsOpen(false)} testId="sc-settings" tall>
          <div className="space-y-5">
            <section className="space-y-1" aria-labelledby="sc-drive-h">
              <h3 id="sc-drive-h" className="text-base font-bold">Is it worth the drive?</h3>
              <div className="flex min-h-14 items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Include driving cost</p><p className="text-xs text-muted-foreground">Off shows every supermarket and leaves the choice to you</p></div><Switch checked={settings.includeDriving} onChange={(v) => sc.setSettings({ includeDriving: v })} label="Include driving cost in settings" /></div>
              {([
                ["sc-perkm", "Driving cost per km", "Fuel and wear", settings.perKm, "perKm", "decimal"],
                ["sc-minsave", "Only suggest another stop if it saves at least", "Smaller savings stay with fewer stops", settings.minSaving, "minSaving", "decimal"],
                ["sc-maxkm", "Furthest I will drive (km)", "From your home or where you are", settings.maxKm, "maxKm", "decimal"],
              ] as const).map(([id, label, sub, val, field, mode]) => (
                <div key={id} className="flex min-h-14 items-center gap-3 border-t pt-2">
                  <label htmlFor={id} className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{sub}</span></label>
                  <Input id={id} key={`${id}-${val}`} defaultValue={String(val)} inputMode={mode} className="h-11 w-24 text-center font-bold" onBlur={(e) => sc.setSettings({ [field]: e.target.value })} />
                </div>
              ))}
              <div className="flex min-h-14 items-center gap-3 border-t pt-2">
                <label htmlFor="sc-maxstops" className="min-w-0 flex-1"><span className="block text-sm font-semibold">Most stops</span><span className="block text-xs text-muted-foreground">Fewer stops, less hassle</span></label>
                <Select id="sc-maxstops" value={settings.maxStops} onChange={(e) => sc.setSettings({ maxStops: Number(e.target.value) as 1 | 2 | 3 })} className="h-11 w-24"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></Select>
              </div>
            </section>
            <section className="space-y-1" aria-labelledby="sc-src-h">
              <h3 id="sc-src-h" className="text-base font-bold">Where prices come from</h3>
              {([
                ["My receipts", "What I paid, newest first", "useOwn"],
                ["Community prices", "Shared by other people in my country", "useCommunity"],
                ["Online store lists", "Super Food, Ling, Do it", "useOnline"],
                ["Prices older than 60 days", "They are marked Old price", "useOld"],
              ] as const).map(([label, sub, field]) => (
                <div key={field} className="flex min-h-14 items-center gap-3 border-t pt-2 first:border-0">
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
                  <Switch checked={settings[field]} onChange={(v) => sc.setSettings({ [field]: v })} label={label} />
                </div>
              ))}
            </section>
            <p className="text-xs text-muted-foreground">These choices and your cart edits are kept on this device.</p>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
