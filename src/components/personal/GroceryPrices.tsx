"use client";

import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronUp, Link2, Minus, Plus, Search, Store, Tag } from "lucide-react";
import { Sparkline } from "@/components/personal/Sparkline";
import { PriceChart, STORE_COLORS } from "@/components/personal/PriceChart";
import type { TrackerRow } from "@/lib/personal/grocery";
import { buildProducts, matchesFilter, pairOf, priceSummary, type MatchDecision, type PriceFilter, type Product, type StoreSummary } from "@/lib/personal/price-compare";
import { fetchPriceMatches, fetchPrices, priceMatchesKey, pricesKey } from "@/lib/offline-grocery";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";
import { createClient } from "@/lib/supabase/client";
import { OfflineNotice } from "@/components/OfflineNotice";
import { formatCurrency, formatDate } from "@/lib/utils";

type Sort = "saving" | "increase" | "recent" | "purchases" | "name";

const chipBase = "inline-flex min-h-6 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";
const RED = "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200";
const GREEN = "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";

/** Always an arrow and a number, never colour alone. */
function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span className={`${chipBase} bg-muted text-muted-foreground`}>new</span>;
  if (pct > 0.5) return <span className={`${chipBase} ${RED}`}><ArrowUp className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Up </span>{pct}%</span>;
  if (pct < -0.5) return <span className={`${chipBase} ${GREEN}`}><ArrowDown className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Down </span>{Math.abs(pct)}%</span>;
  return <span className={`${chipBase} bg-muted text-muted-foreground`}><Minus className="h-3 w-3" aria-hidden="true" />same</span>;
}
const Cheapest = () => <span className={`${chipBase} ${GREEN}`}><Tag className="h-3 w-3" aria-hidden="true" />Cheapest</span>;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const heading = "text-xs font-bold uppercase tracking-wide text-muted-foreground";

export function GroceryPrices() {
  const { data, loading, error, savedAt } = useCachedQuery<TrackerRow[]>((uid) => pricesKey(uid), (sb) => fetchPrices(sb), []);
  const matchesQ = useCachedQuery<MatchDecision[]>((uid) => priceMatchesKey(uid), (sb) => fetchPriceMatches(sb), []);
  const online = useOnline();
  const rows = useMemo(() => data ?? [], [data]);
  const decisions = useMemo(() => matchesQ.data ?? [], [matchesQ.data]);
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("saving");
  const [filter, setFilter] = useState<PriceFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { products, suggestions } = useMemo(() => buildProducts(rows, decisions), [rows, decisions]);
  const currencies = useMemo(() => [...new Set(products.map((p) => p.currency))], [products]);
  const cur = currency || currencies[0] || "USD";
  const inCur = useMemo(() => products.filter((p) => p.currency === cur), [products, cur]);
  const summary = useMemo(() => priceSummary(inCur), [inCur]);
  const multi = inCur.filter((p) => p.stores.length > 1).length;
  const suggestion = suggestions.find((s) => s.keyA.startsWith(`${cur}|`));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      saving: (a, b) => (b.saving?.amount ?? 0) - (a.saving?.amount ?? 0) || (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity),
      increase: (a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity),
      recent: (a, b) => b.lastDate.localeCompare(a.lastDate),
      purchases: (a, b) => b.count - a.count,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return inCur.filter((p) => matchesFilter(p, filter) && (!q || p.names.some((n) => n.name.toLowerCase().includes(q)) || p.name.toLowerCase().includes(q))).sort(by[sort]);
  }, [inCur, query, sort, filter]);

  const fmt = (n: number) => formatCurrency(n, cur);

  async function answer(pairs: [string, string][], same: boolean) {
    setNote(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setNote("Sign in again to save this."); return; }
    const { error: e } = await supabase.from("grocery_price_matches").upsert(
      pairs.map(([a, b]) => { const [key_a, key_b] = pairOf(a, b); return { user_id: uid, key_a, key_b, same }; }),
      { onConflict: "user_id,key_a,key_b" },
    );
    if (e) { setNote(/relation|schema cache/i.test(e.message) ? "Run supabase/migration_price_matches.sql in Supabase to save your answers." : "Could not save that. Try again."); return; }
    await matchesQ.reload();
  }

  const tile = (id: PriceFilter, n: number, label: string, sub: string, color: string) => (
    <button type="button" key={id} onClick={() => setFilter(filter === id ? "all" : id)} aria-pressed={filter === id}
      className={`min-w-0 flex-1 rounded-xl border bg-card p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4 ${filter === id ? "ring-2 ring-primary" : ""}`}>
      <span className="flex items-baseline gap-2"><span className={`text-2xl font-bold leading-none sm:text-3xl ${color}`}>{n}</span><span className="text-sm font-semibold">{label}</span></span>
      <span className="mt-1.5 hidden text-[13px] leading-snug text-muted-foreground sm:block">{sub}</span>
    </button>
  );
  const pill = (id: PriceFilter, label: string, n?: number) => (
    <button type="button" key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
      className={`min-h-10 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent"}`}>
      {label}{n != null ? ` ${n}` : ""}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-28 md:p-8">
      <Link href="/personal/groceries" className="inline-flex min-h-8 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groceries</Link>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Price tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">{inCur.length} item{inCur.length === 1 ? "" : "s"} · {summary.stores} store{summary.stores === 1 ? "" : "s"} · {cur}</p>
        </div>
        <Link href="/personal/groceries/new"><Button className="h-11 gap-2"><Plus className="h-4 w-4" /> <span className="sm:hidden">Scan</span><span className="hidden sm:inline">Scan receipt</span></Button></Link>
      </div>

      <OfflineNotice savedAt={savedAt} />
      {error && <Alert>{error}</Alert>}
      {note && <Alert>{note}</Alert>}

      {inCur.length > 0 && (
        <div className="flex gap-2 sm:gap-3" data-testid="price-tiles">
          {tile("up", summary.up, "Cost more", "than last time at the same store", "text-red-800 dark:text-red-300")}
          {tile("down", summary.down, "Got cheaper", "than last time at the same store", "text-emerald-800 dark:text-emerald-300")}
          {tile("elsewhere", summary.elsewhere, "Cheaper elsewhere", summary.saveTotal > 0 ? `Switch stores and save about ${fmt(summary.saveTotal)} on these` : "Same price everywhere so far", "text-blue-800 dark:text-blue-300")}
        </div>
      )}

      {suggestion && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-900 dark:bg-blue-950/40" data-testid="price-suggestion">
          <p className="flex items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-200"><Link2 className="h-4 w-4" aria-hidden="true" />Same product?</p>
          <p className="mt-1.5 text-[15px] leading-relaxed">
            <b>{suggestion.a.name}</b> <span className="text-muted-foreground">({suggestion.a.stores.join(", ")})</span> and <b>{suggestion.b.name}</b> <span className="text-muted-foreground">({suggestion.b.stores.join(", ")})</span> look alike. Combine them to compare prices?
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" disabled={!online} onClick={() => answer([[suggestion.keyA, suggestion.keyB]], true)} data-testid="price-suggestion-yes">Yes, combine</Button>
            <Button variant="outline" className="h-11" disabled={!online} onClick={() => answer([[suggestion.keyA, suggestion.keyB]], false)}>No, keep apart</Button>
          </div>
          {!online && <p className="mt-2 text-xs text-muted-foreground">Needs a connection to save your answer.</p>}
        </div>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {pill("all", "All", inCur.length)}
        {pill("up", "Went up", summary.up)}
        {pill("down", "Went down", summary.down)}
        {pill("stores", "Compare stores", multi)}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input className="h-11 pl-9" placeholder="Search items" aria-label="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select className="h-11 w-auto min-w-fit px-2" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="saving">Biggest saving</option>
          <option value="increase">Biggest price increase</option>
          <option value="recent">Most recent</option>
          <option value="purchases">Most purchased</option>
          <option value="name">Name</option>
        </Select>
        {currencies.length > 1 && (
          <Select className="h-11 w-auto min-w-fit px-2" value={cur} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
            {currencies.map((c) => <option key={c}>{c}</option>)}
          </Select>
        )}
      </div>

      {!loading && !error && list.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{products.length === 0 ? "Scan a grocery receipt and its items will appear here." : "No items match."}</CardContent></Card>
      )}

      <div className="space-y-3">
        {list.map((p) => (
          <ProductCard key={p.key} p={p} fmt={fmt} isOpen={open === p.key} onToggle={() => setOpen(open === p.key ? null : p.key)} online={online}
            onSeparate={(atomKey) => answer(p.atomKeys.filter((k) => k !== atomKey).map((k) => [atomKey, k] as [string, string]), false)} />
        ))}
      </div>
    </div>
  );
}

function StoreRow({ s, i, max, fmt, unit }: { s: StoreSummary; i: number; max: number; fmt: (n: number) => string; unit: string | null }) {
  return (
    <div className="border-t py-2.5" data-testid="price-store">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold"><Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STORE_COLORS[i % STORE_COLORS.length] }} aria-hidden="true" />{s.store}</span>
        {s.cheapest ? <Cheapest /> : s.extraPct != null && s.extra > 0 && <span className={`${chipBase} ${RED}`}>+{s.extra.toFixed(2)} · {s.extraPct}% more</span>}
        <span className="ml-auto text-[17px] font-bold tabular-nums">{fmt(s.latest.price)}{unit && <span className="text-xs font-normal text-muted-foreground">/{unit}</span>}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted" aria-hidden="true"><div className={`h-2 rounded-full ${s.cheapest ? "bg-emerald-600" : "bg-slate-400"}`} style={{ width: `${Math.max(8, Math.round((s.latest.price / max) * 100))}%` }} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <span className={s.stale ? "font-medium text-amber-800 dark:text-amber-300" : ""}>{s.stale ? `Old price from ${formatDate(s.latest.date)}` : day(s.latest.date)}</span>
        {s.previous ? <><Change pct={s.changePct} /><span>was {fmt(s.previous.price)} on {day(s.previous.date)}</span></> : <span>· only bought once here</span>}
      </div>
    </div>
  );
}

function ProductCard({ p, fmt, isOpen, onToggle, onSeparate, online }: { p: Product; fmt: (n: number) => string; isOpen: boolean; onToggle: () => void; onSeparate: (atomKey: string) => void; online: boolean }) {
  const multi = p.stores.length > 1;
  const best = p.stores[0];
  const max = Math.max(...p.stores.map((s) => s.latest.price));
  const shownPrice = multi ? best.latest.price : p.stats.last;
  const last = p.history[0];
  return (
    <div className={`overflow-hidden rounded-2xl border bg-card ${isOpen ? "shadow-sm" : ""}`} data-testid="price-product">
      <button type="button" className="flex min-h-14 w-full items-center gap-3 p-3.5 text-left sm:p-4" onClick={onToggle} aria-expanded={isOpen}>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold sm:text-lg">{p.name}{p.size && <span className="ml-1.5 font-medium text-muted-foreground">{p.size}</span>}</p>
          <p className="text-[13px] text-muted-foreground">{p.category} · {multi ? `${p.stores.length} stores · ` : `${p.stores[0].store} · `}bought {p.count}x · last {formatDate(p.lastDate)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {p.saving ? (
              <><span className={`${chipBase} ${GREEN}`}>{p.saving.to} saves {fmt(p.saving.amount)} ({Math.round(p.saving.pct * 10) / 10}%)</span><span className="text-[13px] text-muted-foreground">vs {p.saving.from}</span></>
            ) : multi ? (
              <span className="text-[13px] text-muted-foreground">Cheapest at {best.store}, where you bought last</span>
            ) : p.stats.previous != null ? (
              <span className="text-[13px] text-muted-foreground">Was {fmt(p.stats.previous)} on {day(p.history[1]?.date ?? p.lastDate)} · only seen at one store</span>
            ) : (
              <span className="text-[13px] text-muted-foreground">Only seen at one store</span>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 sm:block"><Sparkline values={[...p.history].reverse().map((h) => h.price)} width={96} /></div>
        <div className="shrink-0 text-right">
          {multi && <p className="text-xs text-muted-foreground">Best price</p>}
          <p className={`text-lg font-bold tabular-nums ${multi ? "text-emerald-800 dark:text-emerald-300" : ""}`}>{fmt(shownPrice)}{p.unit && <span className="text-xs font-normal text-muted-foreground">/{p.unit}</span>}</p>
          <div className="mt-1">{multi ? <span className="text-xs text-muted-foreground">{best.store}</span> : <Change pct={p.changePct} />}</div>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className="border-t" data-testid="price-detail">
          <div className="grid gap-x-8 gap-y-4 px-3.5 pb-4 pt-3 sm:px-4 md:grid-cols-2">
            <div className="min-w-0">
              <p className={`${heading} mb-1`}>{multi ? "Latest price by store" : "Price at this store"}</p>
              {p.stores.map((s, i) => <StoreRow key={s.store} s={s} i={i} max={max} fmt={fmt} unit={p.unit} />)}
              {p.saving && (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-100 p-3 text-[15px] leading-snug text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100" data-testid="price-saving">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span><b>{p.saving.to} is cheaper.</b> Buy there and save <b>{fmt(p.saving.amount)}</b> each ({Math.round(p.saving.pct * 10) / 10}%).</span>
                </p>
              )}
              {!p.saving && multi && <p className="mt-2 rounded-xl bg-muted p-3 text-[15px]">You bought it at the cheapest store last time.</p>}
            </div>
            <div className="min-w-0">
              <p className={`${heading} mb-1`}>Price over time</p>
              {p.history.length > 1 ? (
                <>
                  <PriceChart history={p.history} stores={p.stores.map((s) => s.store)} />
                  {multi && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      {p.stores.map((s, i) => <span key={s.store} className="flex items-center gap-1.5"><span className="h-[3px] w-3 rounded" style={{ background: STORE_COLORS[i % STORE_COLORS.length] }} aria-hidden="true" />{s.store}</span>)}
                    </div>
                  )}
                </>
              ) : <p className="text-sm text-muted-foreground">Buy it again and the price history shows here.</p>}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Average</dt><dd className="font-medium">{fmt(p.stats.avg)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Lowest</dt><dd className="font-medium text-emerald-800 dark:text-emerald-300">{fmt(p.stats.min)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Highest</dt><dd className="font-medium text-red-800 dark:text-red-300">{fmt(p.stats.max)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="border-t px-3.5 pb-1 pt-3 sm:px-4">
            <p className={heading}>Every purchase <span className="font-normal normal-case tracking-normal">(change is against the previous price at that store)</span></p>
            {p.history.slice(0, 12).map((h, i) => (
              <div key={i} className="flex items-center gap-3 border-t py-2 text-sm first:mt-1">
                <span className="w-14 shrink-0 text-muted-foreground">{day(h.date)}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{h.store}</span><span className="block truncate text-xs text-muted-foreground">{h.name}</span></span>
                <span className="font-semibold tabular-nums">{fmt(h.price)}</span>
                <span className="flex w-16 justify-end"><Change pct={h.changePct} /></span>
              </div>
            ))}
            {last && p.history.length > 12 && <p className="py-2 text-xs text-muted-foreground">Showing the latest 12 of {p.history.length}.</p>}
          </div>

          {p.names.length > 1 && (
            <div className="border-t px-3.5 py-2.5 sm:px-4" data-testid="price-matched">
              <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />Combined from these receipt names (the same size). Not right? Separate one.</p>
              <ul className="mt-1">
                {p.names.map((n) => (
                  <li key={n.atomKey} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
                    <button type="button" disabled={!online} onClick={() => onSeparate(n.atomKey)} className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Not the same product</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
