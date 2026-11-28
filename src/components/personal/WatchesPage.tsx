"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellRing, Pause, Play, Plus, Search } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/ui/page-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { OfflineNotice } from "@/components/OfflineNotice";
import { WatchSheet, type WatchTarget } from "@/components/personal/WatchSheet";
import { fetchPriceMatches, fetchPrices, priceMatchesKey, pricesKey } from "@/lib/offline-grocery";
import { buildProducts, type MatchDecision, type Product } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { lastPaid, ruleWords, type Watch } from "@/lib/personal/price-watch";
import { watchesStatus } from "@/lib/limits";
import { createClient } from "@/lib/supabase/client";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useLimits } from "@/lib/use-limits";
import { usePriceWatches } from "@/lib/use-price-watches";
import { formatCurrency, todayISO } from "@/lib/utils";

const fullName = (p: Product) => (p.size ? `${p.name} ${p.size}` : p.name);
const targetOf = (p: Product): WatchTarget => {
  const l = lastPaid(p);
  return { key: p.key, name: fullName(p), currency: p.currency, last: l ? { price: l.price, store: l.store } : null, now: p.stores[0] ? { price: p.stores[0].latest.price, store: p.stores[0].store } : null };
};

/** Everything being watched for a price drop: what each waits for, whether it dropped, pause and change. */
export function WatchesPage() {
  const watchesQ = usePriceWatches();
  const pricesQ = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matchesQ = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const lim = useLimits();
  const watches = useMemo(() => watchesQ.data ?? [], [watchesQ.data]);
  const { products } = useMemo(() => buildProducts(pricesQ.data ?? [], matchesQ.data ?? []), [pricesQ.data, matchesQ.data]);
  const byKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  const [editing, setEditing] = useState<WatchTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const [find, setFind] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cap = lim ? watchesStatus(lim.limits, lim.who, watches.length, todayISO()) : null;
  const upgrade = !!lim && !lim.who.pro && !lim.who.admin && cap?.limit != null;

  const targetFor = (w: Watch): WatchTarget => { const p = byKey.get(w.product_key); return p ? targetOf(p) : { key: w.product_key, name: w.name, currency: w.currency, last: null, now: null }; };
  async function toggle(w: Watch) {
    setError(null);
    const { error: e } = await createClient().from("price_watches").update({ paused: !w.paused }).eq("id", w.id);
    if (e) return setError("Could not change the watch. Try again.");
    await watchesQ.reload();
  }
  const choices = useMemo(() => {
    const watched = new Set(watches.map((w) => w.product_key));
    const q = find.trim().toLowerCase();
    return products.filter((p) => !watched.has(p.key) && (!q || fullName(p).toLowerCase().includes(q))).slice(0, 30);
  }, [products, watches, find]);

  return (
    <PageShell size="form" className="space-y-4">
      <Link href="/personal/groceries/prices" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Price tracker</Link>
      <PageHeader title="Price watches" description="Get a message when something you buy gets cheaper." />
      <OfflineNotice savedAt={null} />
      {(error || watchesQ.error) && <Alert>{error ?? watchesQ.error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="watch-count">{cap?.limit != null ? `${watches.length} of ${cap.limit}${upgrade ? " on Free" : ""}` : `${watches.length} ${watches.length === 1 ? "watch" : "watches"}`}</p>
        <Button className="h-11 gap-2" onClick={() => { setFind(""); setPicking(true); }} data-testid="watch-add"><Plus className="h-4 w-4" aria-hidden="true" />Watch a product</Button>
      </div>

      {watchesQ.loading && !watchesQ.data ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        : watches.length === 0 ? (
          <div className="rounded-2xl border p-5 text-center" data-testid="watch-empty">
            <p className="font-semibold">Nothing watched yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Pick a product you buy. You get one message a morning when it gets cheaper.</p>
          </div>
        ) : (
          <ul className="rounded-2xl border" data-testid="watch-list">
            {watches.map((w) => {
              const p = byKey.get(w.product_key);
              const fmt = (n: number) => formatCurrency(n, w.currency);
              const dropped = !w.paused && w.last_alert_price != null;
              return (
                <li key={w.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0" data-testid="watch-row" data-state={w.paused ? "paused" : dropped ? "dropped" : "waiting"}>
                  <button type="button" onClick={() => setEditing(targetFor(w))} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Change the watch on ${w.name}`}>
                    {dropped ? <BellRing className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : <Bell className={`h-5 w-5 shrink-0 ${w.paused ? "text-muted-foreground/50" : "text-muted-foreground"}`} aria-hidden="true" />}
                    <span className="min-w-0">
                      <b className={`block truncate text-sm ${w.paused ? "text-muted-foreground" : ""}`}>{w.name}</b>
                      {dropped && <span className="block text-xs text-emerald-800 dark:text-emerald-300" data-testid="watch-dropped">Dropped: {fmt(w.last_alert_price as number)} at {w.last_alert_store}</span>}
                      <span className="block text-xs text-muted-foreground" data-testid="watch-rule">{w.paused ? "Paused. " : ""}{ruleWords(w, fmt)}{!dropped && p?.stores[0] ? `. Now ${fmt(p.stores[0].latest.price)} at ${p.stores[0].store}` : ""}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => toggle(w)} aria-label={`${w.paused ? "Resume" : "Pause"} the watch on ${w.name}`} data-testid="watch-pause" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent">
                    {w.paused ? <Play className="h-[18px] w-[18px]" aria-hidden="true" /> : <Pause className="h-[18px] w-[18px]" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

      {upgrade && <Link href="/personal/pro" className="flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold hover:bg-accent" data-testid="watch-get-pro-link">Get Pro for more watches</Link>}

      {picking && (
        <BottomSheet title="Watch a product" onClose={() => setPicking(false)} testId="watch-picker" tall>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input className="h-11 pl-9" placeholder="Search what you buy" aria-label="Search what you buy" value={find} onChange={(e) => setFind(e.target.value)} data-testid="watch-search" />
          </div>
          {products.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Scan a grocery receipt and what you buy will show here.</p>
            : choices.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nothing matches.</p>
            : (
              <ul>
                {choices.map((p) => (
                  <li key={p.key}>
                    <button type="button" onClick={() => { setPicking(false); setEditing(targetOf(p)); }} className="flex min-h-12 w-full items-center gap-3 border-b py-2 text-left" data-testid="watch-choice">
                      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{fullName(p)}</b><span className="block text-xs text-muted-foreground">{p.category} · {p.currency}</span></span>
                      <Bell className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </BottomSheet>
      )}

      {editing && (
        <WatchSheet target={editing} existing={watches.find((w) => w.product_key === editing.key) ?? null} count={watches.length} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void watchesQ.reload(); }} />
      )}
    </PageShell>
  );
}
