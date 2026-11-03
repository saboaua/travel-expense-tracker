"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowLeft, ArrowUp, Minus, Plus, Search } from "lucide-react";
import { Sparkline } from "@/components/personal/Sparkline";
import { buildTracker, type TrackedItem, type TrackerRow } from "@/lib/personal/grocery";
import { fetchAll } from "@/lib/personal/fetch-all";
import { formatCurrency, formatDate } from "@/lib/utils";

type Sort = "increase" | "recent" | "purchases" | "name";

export function GroceryPrices() {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("increase");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    fetchAll<Omit<TrackerRow, "receipt"> & { grocery_receipts: TrackerRow["receipt"] | TrackerRow["receipt"][] }>((a, b) =>
      supabase.from("grocery_items").select("name, normalized_name, category, unit_price, quantity, unit, line_total, grocery_receipts!inner(store, purchase_date, currency)").order("created_at", { ascending: false }).range(a, b)
    )
      .then((data) =>
        setRows(
          data.map((d) => ({
            name: d.name,
            normalized_name: d.normalized_name,
            category: d.category,
            unit_price: Number(d.unit_price),
            quantity: Number(d.quantity),
            unit: d.unit ?? null,
            line_total: Number(d.line_total),
            receipt: Array.isArray(d.grocery_receipts) ? d.grocery_receipts[0] : d.grocery_receipts,
          }))
        )
      )
      .catch((e) => setError(/relation|schema cache/i.test(e.message) ? "Personal tables not found. Run supabase/migration_personal.sql in Supabase." : e.message))
      .finally(() => setLoading(false));
  }, []);

  const tracked = useMemo(() => buildTracker(rows), [rows]);
  const currencies = useMemo(() => [...new Set(tracked.map((t) => t.currency))], [tracked]);
  const cur = currency || currencies[0] || "USD";

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = tracked.filter((t) => t.currency === cur && (!q || t.name.toLowerCase().includes(q)));
    const by: Record<Sort, (a: TrackedItem, b: TrackedItem) => number> = {
      increase: (a, b) => (b.stats.changePct ?? -Infinity) - (a.stats.changePct ?? -Infinity),
      recent: (a, b) => b.stats.lastDate.localeCompare(a.stats.lastDate),
      purchases: (a, b) => b.stats.count - a.stats.count,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return filtered.sort(by[sort]);
  }, [tracked, cur, query, sort]);

  const risers = list.filter((t) => t.stats.trend === "up").length;
  const fmt = (n: number) => formatCurrency(n, cur);

  const badge = (t: TrackedItem) => {
    const p = t.stats.changePct;
    if (p == null) return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">new</span>;
    if (t.stats.trend === "up") return <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"><ArrowUp className="h-3 w-3" />{p}%</span>;
    if (t.stats.trend === "down") return <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><ArrowDown className="h-3 w-3" />{Math.abs(p)}%</span>;
    return <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:p-8">
      <Link href="/personal/groceries" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Groceries</Link>
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Price tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">{list.length} items{risers ? ` · ${risers} cost more than last time` : ""}</p>
        </div>
        <Link href="/personal/groceries/new"><Button className="gap-2"><Plus className="h-4 w-4" /> Scan receipt</Button></Link>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="increase">Biggest price increase</option>
          <option value="recent">Most recent</option>
          <option value="purchases">Most purchased</option>
          <option value="name">Name</option>
        </select>
        {currencies.length > 1 && (
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={cur} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
            {currencies.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      {!loading && !error && list.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{tracked.length === 0 ? "Scan a grocery receipt and its items will appear here." : "No items match."}</CardContent></Card>
      )}

      <div className="space-y-2">
        {list.map((t) => {
          const isOpen = open === t.key;
          const stores = new Map<string, number[]>();
          t.history.forEach((h) => stores.set(h.store, [...(stores.get(h.store) || []), h.price]));
          return (
            <div key={t.key} className="rounded-xl border bg-card">
              <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : t.key)} aria-expanded={isOpen}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.category} · bought {t.stats.count}x · last {formatDate(t.stats.lastDate)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Sparkline values={t.history.map((h) => h.price)} />
                  <div className="text-right"><p className="font-semibold">{fmt(t.stats.last)}{t.unit ? <span className="text-xs font-normal text-muted-foreground">/{t.unit}</span> : null}</p>{badge(t)}</div>
                </div>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Average</p><p className="font-medium">{fmt(t.stats.avg)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Lowest</p><p className="font-medium text-emerald-700">{fmt(t.stats.min)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Highest</p><p className="font-medium text-red-700">{fmt(t.stats.max)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total spent</p><p className="font-medium">{fmt(t.totalSpent)}</p></div>
                  </div>
                  {t.stats.previous != null && (
                    <p className="text-sm">Last time <strong>{fmt(t.stats.previous)}</strong>, now <strong>{fmt(t.stats.last)}</strong>{t.stats.changeVsAvgPct != null ? ` (${t.stats.changeVsAvgPct > 0 ? "+" : ""}${t.stats.changeVsAvgPct}% vs your average)` : ""}.</p>
                  )}
                  {stores.size > 1 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">By store (average price)</p>
                      {[...stores.entries()].map(([s, ps]) => ({ s, avg: ps.reduce((a, b) => a + b, 0) / ps.length })).sort((a, b) => a.avg - b.avg).map((x, i) => (
                        <div key={x.s} className="flex justify-between text-sm"><span>{x.s}{i === 0 ? " · cheapest" : ""}</span><span className="tabular-nums">{fmt(x.avg)}</span></div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">History</p>
                    {[...t.history].reverse().slice(0, 12).map((h, i) => (
                      <div key={i} className="flex justify-between text-sm"><span>{formatDate(h.date)} · {h.store}</span><span className="tabular-nums">{fmt(h.price)}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
