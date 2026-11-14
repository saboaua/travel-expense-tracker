"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { groupCommunity, type CommunityRow } from "@/lib/personal/community";
import { formatCurrency } from "@/lib/utils";

const heading = "text-xs font-bold uppercase tracking-wide text-muted-foreground";
const NEVER = ["Your name, email or account", "The receipt photo or total", "The date and time you shopped", "What else was in your basket", "Where you were"];

export function CommunityPrices() {
  const [on, setOn] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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
  }, []);
  useEffect(() => { load(); }, [load]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true); setErr(null);
    const { data, error } = await createClient().rpc("community_search", { q: q.trim() });
    setSearching(false);
    if (error) return setErr("Could not look that up right now.");
    setRows((data ?? []) as CommunityRow[]);
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

      {!available ? (
        <Alert variant="info">Community prices are not set up yet. An admin needs to run supabase/migration_shared_prices.sql.</Alert>
      ) : (
        <>
          <Card data-testid="share-card"><CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-bold">{on ? "You are sharing your prices" : "You are not sharing your prices"}</p><p className="text-sm text-muted-foreground">Turn sharing on or off, or delete what you shared, in your Profile.</p></div></div>
            <Link href="/profile" data-testid="profile-link" className="shrink-0 text-sm font-semibold text-primary underline">Open Profile</Link>
          </CardContent></Card>

          <Card><CardContent className="space-y-2 p-4">
            <h2 className={heading}>Never shared</h2>
            <ul className="space-y-1 text-sm">{NEVER.map((n) => <li key={n}>✕ {n}</li>)}</ul>
            <p className="text-xs text-muted-foreground">Only the store, item name and price are shared. No name, account, receipt or date. A price is shown to others only when 3 or more different people reported it. You can switch sharing off at any time.</p>
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
