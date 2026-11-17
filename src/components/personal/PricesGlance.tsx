"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Store, TrendingUp } from "lucide-react";
import { Money } from "@/components/ui/money";
import { IconTile } from "@/components/ui/icon-tile";
import { fetchPriceMatches, fetchPrices, priceMatchesKey, pricesKey } from "@/lib/offline-grocery";
import { priceGlance, type BestGlance, type TrackerGlance } from "@/lib/personal/prices-glance";
import type { MatchDecision } from "@/lib/personal/price-compare";
import type { TrackerRow } from "@/lib/personal/grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { formatCurrency } from "@/lib/utils";

const chip = "inline-flex min-h-6 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold";
const RED = "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";
const GREEN = "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
const BLUE = "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
const card = "group flex min-h-[196px] flex-col gap-2.5 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function TrackerCard({ t }: { t: TrackerGlance }) {
  const fmt = (n: number) => formatCurrency(n, t.currency);
  const line = t.riser && t.faller
    ? <><b>{t.riser.name}</b> went up {t.riser.pct}%{t.riser.store ? ` at ${t.riser.store}` : ""}. <b>{t.faller.name}</b> got cheaper, down {t.faller.pct}%.</>
    : t.riser ? <><b>{t.riser.name}</b> went up {t.riser.pct}%{t.riser.store ? ` at ${t.riser.store}` : ""}.</>
    : t.faller ? <><b>{t.faller.name}</b> got cheaper, down {t.faller.pct}%{t.faller.store ? ` at ${t.faller.store}` : ""}.</>
    : <>Nothing has changed price since your last receipts.</>;
  return (
    <Link href="/personal/groceries/prices" className={card} data-testid="glance-tracker">
      <span className="flex items-center gap-3">
        <IconTile tone="groceries" className="h-[42px] w-[42px]"><TrendingUp className="h-5 w-5" /></IconTile>
        <span className="min-w-0 flex-1"><span className="block text-base font-extrabold leading-tight">Price tracker</span><span className="block text-[13px] text-muted-foreground">{t.items} {t.items === 1 ? "item" : "items"} · {t.stores} {t.stores === 1 ? "store" : "stores"}</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-semibold leading-snug">{line}</span>
      <span className="mt-auto flex flex-wrap gap-1.5">
        {t.up > 0 && <span className={`${chip} ${RED}`}>{t.up} cost more</span>}
        {t.down > 0 && <span className={`${chip} ${GREEN}`}>{t.down} got cheaper</span>}
        {t.saveTotal > 0 && <span className={`${chip} ${BLUE}`}>Save about {fmt(t.saveTotal)}</span>}
      </span>
    </Link>
  );
}

function BestCard({ b }: { b: BestGlance }) {
  return (
    <Link href="/personal/groceries/basket" className={card} data-testid="glance-best">
      <span className="flex items-center gap-3">
        <IconTile tone="place" className="h-[42px] w-[42px]"><Store className="h-5 w-5" /></IconTile>
        <span className="min-w-0 flex-1"><span className="block text-base font-extrabold leading-tight">Best prices</span><span className="block text-[13px] text-muted-foreground">Your list · {b.listItems} {b.listItems === 1 ? "item" : "items"}</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-semibold leading-snug"><b>{b.store}</b> is cheapest for your list: <Money amount={b.total} currency={b.currency} />.</span>
      <span className="mt-auto flex flex-wrap gap-1.5">
        {b.saving != null && b.saving > 0 && <span className={`${chip} ${GREEN}`}>Saves {formatCurrency(b.saving, b.currency)}</span>}
        {b.priced < b.listItems && <span className={`${chip} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200`}>{b.priced} of {b.listItems} priced</span>}
      </span>
    </Link>
  );
}

/**
 * The Personal dashboard's price cards: Price tracker and Best store, side by side in a row you swipe on a phone.
 * Each is a headline and a few chips; tapping opens the full page. A card with nothing to show is left out.
 */
export function PricesGlance() {
  const prices = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matches = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const listQ = useCachedQuery<{ product_key: string; qty: number }[]>((uid) => `${uid}:basket:list`, async (sb) => {
    const r = await sb.from("shopping_list_items").select("id, product_key, name, qty").order("created_at");
    return { data: (r.data ?? []) as { product_key: string; qty: number }[], error: r.error };
  }, []);
  const now = useMemo(() => new Date(), []);
  const glance = useMemo(() => priceGlance(prices.data ?? [], matches.data ?? [], listQ.data ?? [], now), [prices.data, matches.data, listQ.data, now]);
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const cards = [glance.tracker && <TrackerCard key="t" t={glance.tracker} />, glance.best && <BestCard key="b" b={glance.best} />].filter(Boolean);
  if (cards.length === 0) return null;
  return (
    <section aria-label="Prices" data-testid="prices-glance" className="space-y-2">
      <div
        ref={scroller}
        onScroll={(e) => { const el = e.currentTarget; setPage(el.scrollLeft + el.clientWidth / 2 > el.scrollWidth / 2 ? 1 : 0); }}
        className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => <div key={i} className="w-[86%] max-w-[330px] shrink-0 snap-start sm:w-[calc(50%-5px)] sm:max-w-none">{c}</div>)}
      </div>
      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
          {cards.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${page === i ? "w-[18px] bg-primary" : "w-1.5 bg-border"}`} />)}
        </div>
      )}
    </section>
  );
}
