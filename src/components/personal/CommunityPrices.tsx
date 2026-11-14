"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Search, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { fetchPriceMatches, fetchPrices, priceMatchesKey, pricesKey } from "@/lib/offline-grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { buildProducts, type MatchDecision } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { groupCommunity, syncSharedPrices, type CommunityRow } from "@/lib/personal/community";
import { formatCurrency } from "@/lib/utils";

const heading = "text-xs font-bold uppercase tracking-wide text-muted-foreground";
const NEVER = ["Your name, email or account", "The receipt photo or total", "The date and time you shopped", "What else was in your basket", "Where you were"];

export function CommunityPrices() {
  const prices = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matches = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const { products } = useMemo(() => buildProducts(prices.data ?? [], matches.data ?? []), [prices.data, matches.data]);
  const [on, setOn] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CommunityRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data, error } = await sb.from("profiles").select("share_prices").eq("id", session.user.id).single();
    if (error) { setAvailable(false); return; } // migration_shared_prices.sql has not been run
    setOn(data?.share_prices === true);
    const c = await sb.rpc("my_shared_count");
    setMine(c.error ? null : Number(c.data) || 0);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (on == null) return;
    setBusy(true); setErr(null); setMsg(null);
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setBusy(false); return; }
    const next = !on;
    const { error } = await sb.from("profiles").update({ share_prices: next }).eq("id", session.user.id);
    if (error) { setBusy(false); return setErr("Could not save that. Please try again."); }
    setOn(next);
    if (next) {
      const n = await syncSharedPrices(sb, session.user.id, products, new Date(), true);
      setMsg(n > 0 ? `Sharing is on. ${n} price${n === 1 ? "" : "s"} from the last 60 days shared.` : "Sharing is on. New prices are shared when you save receipts.");
    } else setMsg("Sharing is off. Nothing more will be shared.");
    await load();
    setBusy(false);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true); setErr(null);
    const { data, error } = await createClient().rpc("community_search", { q: q.trim() });
    setSearching(false);
    if (error) return setErr("Could not look that up right now.");
    setRows((data ?? []) as CommunityRow[]);
  };

  const withdraw = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await createClient().rpc("unshare_my_prices");
    setBusy(false);
    if (error) return setErr("Could not delete them. Please try again.");
    setMsg(`Deleted ${Number(data) || 0} shared price${Number(data) === 1 ? "" : "s"}.`);
    await load();
  };

  const groups = useMemo(() => groupCommunity(rows ?? []), [rows]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div>
        <Link href="/personal/groceries/prices" className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Price tracker</Link>
        <h1 className="mt-1 text-2xl font-bold">Community prices</h1>
        <p className="text-sm text-muted-foreground">Share a little, see the best price</p>
      </div>
      {err && <Alert variant="error">{err}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      {!available ? (
        <Alert variant="info">Community prices are not set up yet. An admin needs to run supabase/migration_shared_prices.sql.</Alert>
      ) : (
        <>
          <Card data-testid="share-card"><CardContent className="space-y-3 p-4">
            <div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-bold">Share prices, get community prices</p><p className="text-sm text-muted-foreground">When you save a receipt, Lifolio can share only <b>store, product and price</b>, so everyone can see the best price. It is off until you turn it on.</p></div></div>
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <label htmlFor="share-toggle" className="text-sm font-semibold">Share my receipt prices</label>
              <button id="share-toggle" type="button" role="switch" aria-checked={on === true} disabled={busy || on == null} onClick={toggle} data-testid="share-toggle" className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"}`}>
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
                <span className="sr-only">{on ? "On" : "Off"}</span>
              </button>
            </div>
          </CardContent></Card>

          <Card><CardContent className="space-y-2 p-4">
            <h2 className={heading}>Never shared</h2>
            <ul className="space-y-1 text-sm">{NEVER.map((n) => <li key={n}>✕ {n}</li>)}</ul>
            <p className="text-xs text-muted-foreground">Shared prices carry no name or account, and the date is rounded to the month. A price is shown to others only when 3 or more different people reported it. You can switch sharing off at any time.</p>
            {mine != null && mine > 0 && <Button type="button" variant="outline" className="mt-1 h-11 gap-2" disabled={busy} onClick={withdraw} data-testid="share-delete"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete the {mine} price{mine === 1 ? "" : "s"} I shared</Button>}
          </CardContent></Card>

          <Card><CardContent className="space-y-3 p-4">
            <h2 className={heading}>Look up a product</h2>
            <form onSubmit={search} className="flex gap-2" role="search">
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Coca-Cola, rice, milk…" className="pl-9" aria-label="Product to look up" /></div>
              <Button type="submit" className="h-10" disabled={searching || q.trim().length < 2}>{searching ? "…" : "Search"}</Button>
            </form>
            {rows && groups.length === 0 && <p className="text-sm text-muted-foreground" data-testid="community-empty">No community price yet for that. A price appears once 3 people have reported it.</p>}
            <div className="space-y-3" data-testid="community-results">
              {groups.map((g) => (
                <div key={g.key} className="rounded-xl border p-3">
                  <p className="font-bold">{g.name}{g.size ? ` · ${g.size}` : ""}</p>
                  {g.stores.map((s) => (
                    <div key={s.store} className="mt-1.5 flex items-start justify-between gap-2 border-t pt-1.5 text-sm first:border-0">
                      <span><b>{s.store}</b>{s.lowest && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">Lowest</span>}<span className="block text-xs text-muted-foreground">{s.reporters} reports · last 60 days</span></span>
                      <b className="tabular-nums">{formatCurrency(s.price, g.currency)}</b>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Community price = the middle price people reported in the last 60 days.</p>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
