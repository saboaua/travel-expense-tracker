"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/lib/use-online";
import { searchBestPrices, type OfferSource, type PriceGroup } from "@/lib/personal/best-prices";
import type { CommunityRow } from "@/lib/personal/community";
import type { Product } from "@/lib/personal/price-compare";
import { ONLINE_CURRENCY, type OnlineMatch } from "@/lib/store-prices";
import { formatCurrency } from "@/lib/utils";

const SOURCE_CLS: Record<OfferSource, string> = {
  own: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
  community: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
  online: "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200",
};

/** Best Prices: look up any item and see the cheapest place, from your receipts, the community and the online price lists. */
export function PriceSearch({ products, currency }: { products: Product[]; currency: string }) {
  const online = useOnline();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [groups, setGroups] = useState<PriceGroup[] | null>(null);
  const [asked, setAsked] = useState("");

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (text.length < 2) return;
    setBusy(true); setErr(null);
    let community: CommunityRow[] = [];
    let shops: OnlineMatch[] = [];
    if (online) {
      const [c, o] = await Promise.all([
        (async () => { try { const r = await createClient().rpc("community_search", { q: text }); return r.error ? [] : ((r.data ?? []) as CommunityRow[]); } catch { return [] as CommunityRow[]; } })(),
        currency === ONLINE_CURRENCY
          ? fetch("/api/store-prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: [{ key: "search", names: [text] }] }) })
              .then(async (r) => (r.ok ? (((await r.json()) as { matches?: Record<string, OnlineMatch[]> }).matches?.search ?? []) : []))
              .catch(() => [] as OnlineMatch[])
          : Promise.resolve([] as OnlineMatch[]),
      ]);
      community = c; shops = o;
    } else setErr("You are offline, so only your own receipts are searched.");
    setGroups(searchBestPrices({ q: text, products, community, online: shops, currency }));
    setAsked(text);
    setBusy(false);
  };

  return (
    <Card data-testid="price-search"><CardContent className="space-y-3 p-4">
      <form onSubmit={run} className="flex gap-2" role="search">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a price: Corona, rice, milk…" className="pl-9" aria-label="Search a price" data-testid="price-search-input" /></div>
        <Button type="submit" className="h-10" disabled={busy || q.trim().length < 2}>{busy ? "…" : "Search"}</Button>
      </form>
      {err && <Alert variant="info">{err}</Alert>}
      {groups && groups.length === 0 && <p className="text-sm text-muted-foreground" data-testid="price-search-empty">No price found for “{asked}”. Community prices appear once 3 people have reported them.</p>}
      <div className="space-y-4" data-testid="price-search-results">
        {groups?.map((g) => (
          <div key={g.key} className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">{g.name}{g.size ? ` ${g.size}` : ""} · {g.offers.length} price{g.offers.length === 1 ? "" : "s"}</p>
            {g.offers.map((o) => (
              <div key={`${o.store}|${o.source}`} data-testid="price-offer" className={`flex items-center justify-between gap-2 rounded-xl p-2.5 ${o.best ? "border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" : "border"}`}>
                <span className="min-w-0"><b className="block truncate">{o.store}</b><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_CLS[o.source]}`}>{o.note}</span></span>
                <span className="shrink-0 text-right"><b className={`block text-lg tabular-nums ${o.best ? "text-emerald-800 dark:text-emerald-300" : ""}`}>{formatCurrency(o.price, g.currency)}</b>{o.best && <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Best price</span>}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Includes your receipts, community prices (the middle price of 3 or more people, nobody can be identified) and online price lists. Works whether or not you share your own prices.</p>
    </CardContent></Card>
  );
}
