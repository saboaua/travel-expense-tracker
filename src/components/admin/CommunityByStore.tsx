"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { CountryCount, StoreCount } from "@/lib/personal/community-stores";
import { CATEGORIES, categoryLabel, type CategoryId } from "@/lib/personal/store-categories";
import { cn } from "@/lib/utils";

const monthOf = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const n = (v: number) => v.toLocaleString();
const SHOWN = 10;
const TILE: Record<CategoryId, string> = {
  supermarkets: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  clothing: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
  health: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  other: "bg-muted text-muted-foreground",
};

/**
 * Admin overview inside Directory places: what the community has shared, in total, then by category. A category opens to its stores
 * (most products first), and a store can be moved to another category. Counts only: nobody is named.
 */
export function CommunityByStore({ country, all, onMoved }: { country: string; all: CountryCount[] | null; onMoved: () => void }) {
  const c = all?.find((x) => x.country === country) ?? null;
  const [openCat, setOpenCat] = useState<CategoryId | null>(null);
  const [more, setMore] = useState<CategoryId | null>(null);
  const [moving, setMoving] = useState<StoreCount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!all) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!c) return <p className="text-sm text-muted-foreground" data-testid="community-none">No community prices for this country yet.</p>;
  return (
    <div className="space-y-3" data-testid="community-by-store">
      {notice && <Alert variant="success">{notice}</Alert>}
      <dl className="grid grid-cols-3 gap-3" data-testid="community-totals">
        <div><dt className="text-xs text-muted-foreground">Unique products</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.products)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Stores</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.stores)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Shoppers</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.shoppers)}</dd></div>
      </dl>
      <ul className="divide-y border-t" data-testid="community-categories">
        {c.categories.map((cat) => {
          const open = openCat === cat.id;
          const list = more === cat.id ? cat.list : cat.list.slice(0, SHOWN);
          return (
            <li key={cat.id} data-testid={`community-category-${cat.id}`}>
              <button type="button" aria-expanded={open} onClick={() => setOpenCat(open ? null : cat.id)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span aria-hidden="true" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold", TILE[cat.id])}>{categoryLabel(cat.id)[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{categoryLabel(cat.id)}</span>
                  <span className="block text-xs text-muted-foreground">{n(cat.stores)} {cat.stores === 1 ? "store" : "stores"} · {n(cat.products)} {cat.products === 1 ? "product" : "products"}</span>
                </span>
                <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                cat.list.length === 0 ? <p className="pb-3 pl-12 text-sm text-muted-foreground">No stores here yet. Use Move on a store to put it in {categoryLabel(cat.id)}.</p> : (
                  <ul className="pb-2 pl-12">
                    {list.map((s) => (
                      <li key={s.storeKey} className="flex min-h-[60px] items-center gap-3 border-t border-dashed py-2 first:border-t-0" data-testid="community-store-row">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{s.name}</span>
                          <span className="block text-xs text-muted-foreground">{n(s.prices)} prices · {n(s.shoppers)} {s.shoppers === 1 ? "shopper" : "shoppers"}{s.last ? ` · last ${monthOf(s.last)}` : ""}</span>
                        </span>
                        <span className="text-right"><span className="block text-lg font-extrabold tabular-nums">{n(s.products)}</span><span className="block text-[11.5px] text-muted-foreground">{s.products === 1 ? "product" : "products"}</span></span>
                        <Button variant="outline" className="min-h-11 px-3" onClick={() => { setNotice(null); setMoving(s); }} aria-label={`Move ${s.name} to another category`} data-testid="community-store-move">Move</Button>
                      </li>
                    ))}
                    {cat.list.length > SHOWN && more !== cat.id && <li><button type="button" className="min-h-11 text-sm font-semibold text-primary" onClick={() => setMore(cat.id)}>Show {cat.list.length - SHOWN} more {cat.list.length - SHOWN === 1 ? "store" : "stores"}</button></li>}
                  </ul>
                )
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t pt-2 text-xs text-muted-foreground">A product at two stores counts once in the total, and once in each category. New stores start in Supermarkets. Counts only; shoppers are never named.</p>
      {moving && <MoveStore store={moving} country={country} onClose={() => setMoving(null)} onMoved={(to) => { setMoving(null); setNotice(`${moving.name} is now in ${categoryLabel(to)}.`); setOpenCat(to); onMoved(); }} />}
    </div>
  );
}

function MoveStore({ store, country, onClose, onMoved }: { store: StoreCount; country: string; onClose: () => void; onMoved: (to: CategoryId) => void }) {
  const [pick, setPick] = useState<CategoryId>(store.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/admin/store-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, storeKey: store.storeKey, category: pick }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Could not move it.");
    onMoved(pick);
  };
  return (
    <BottomSheet title={`Move ${store.name}`} onClose={onClose} testId="store-move-sheet">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Pick the category its prices belong in. Now in {categoryLabel(store.category)}.</p>
        {error && <Alert>{error}</Alert>}
        <fieldset className="divide-y rounded-xl border px-3">
          <legend className="sr-only">Category</legend>
          {CATEGORIES.map((c) => (
            <label key={c.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
              <input type="radio" name="store-category" value={c.id} checked={pick === c.id} onChange={() => setPick(c.id)} className="h-5 w-5 accent-primary" />
              <span><span className="block text-[15px] font-bold">{c.label}</span><span className="block text-xs text-muted-foreground">{c.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Button className="min-h-[52px] w-full" onClick={save} disabled={busy || pick === store.category} data-testid="store-move-save">{busy ? "Moving…" : `Move to ${categoryLabel(pick)}`}</Button>
        <Button variant="outline" className="min-h-[52px] w-full" onClick={onClose} disabled={busy}>Cancel</Button>
      </div>
    </BottomSheet>
  );
}
