"use client";

import { Card, CardContent } from "@/components/ui/card";
const monthOf = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
import { useCommunityCounts } from "@/components/admin/use-community-counts";

const n = (v: number) => v.toLocaleString();

/** Admin overview on Supermarket places: how many different products the community has shared, in total and per store. Counts only, nobody is named. */
export function CommunityByStore({ country }: { country: string }) {
  const all = useCommunityCounts();
  const c = all?.find((x) => x.country === country) ?? null;
  return (
    <div className="space-y-3" data-testid="community-by-store">
      <Card><CardContent className="p-4">
        {!all ? <p className="text-sm text-muted-foreground">Loading…</p> : !c ? <p className="text-sm text-muted-foreground" data-testid="community-none">No community prices for this country yet.</p> : (
          <>
            <dl className="grid grid-cols-3 gap-3" data-testid="community-totals">
              <div><dt className="text-xs text-muted-foreground">Unique products</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.products)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Stores</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.stores)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Shoppers</dt><dd className="text-2xl font-extrabold tabular-nums">{n(c.shoppers)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">One product at two stores counts once in the total, and once in each store.</p>
          </>
        )}
      </CardContent></Card>
      {c && (
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-extrabold">Community products by store</h2><span className="text-xs text-muted-foreground">Most first</span></div>
          <ul className="mt-1 divide-y">
            {c.list.map((s) => (
              <li key={s.storeKey} className="flex min-h-[64px] items-center gap-3 py-2" data-testid="community-store-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{n(s.prices)} prices · {n(s.shoppers)} {s.shoppers === 1 ? "shopper" : "shoppers"}{s.last ? ` · last ${monthOf(s.last)}` : ""}</span>
                </span>
                <span className="text-right"><span className="block text-lg font-extrabold tabular-nums">{n(s.products)}</span><span className="block text-[11.5px] text-muted-foreground">{s.products === 1 ? "product" : "products"}</span></span>
              </li>
            ))}
          </ul>
          <p className="border-t pt-2 text-xs text-muted-foreground">Counts only. Shoppers are never named.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
