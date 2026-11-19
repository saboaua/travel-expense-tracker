"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useTripChoices } from "@/components/personal/TripPicker";
import { formatCurrency } from "@/lib/utils";

type Line = { ref: string; currency: string; amount: number; n: number };

/** The year's credit card spending while traveling, by trip: personal receipts tagged to a trip and expenses of personal trips. */
export function CreditWhileTraveling({ year }: { year: string }) {
  const trips = useTripChoices();
  const [lines, setLines] = useState<Line[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sb = createClient();
        const [r, e] = await Promise.all([
          sb.from("grocery_receipts").select("total, currency, trip_ref, prices_only").eq("paid_with", "credit").not("trip_ref", "is", null).gte("purchase_date", `${year}-01-01`).lte("purchase_date", `${year}-12-31`).limit(2000),
          sb.from("personal_expenses").select("amount, currency, project_id").eq("paid_with", "credit").gte("expense_date", `${year}-01-01`).lte("expense_date", `${year}-12-31`).limit(2000),
        ]);
        if (!live) return;
        const m = new Map<string, Line>();
        const add = (ref: string, currency: string, amount: number) => { const k = `${ref}|${currency}`; const x = m.get(k) ?? { ref, currency, amount: 0, n: 0 }; x.amount += amount; x.n++; m.set(k, x); };
        for (const x of (r.data ?? []) as { total: number | string; currency: string; trip_ref: string; prices_only?: boolean | null }[]) if (!x.prices_only) add(x.trip_ref, x.currency, Number(x.total));
        for (const x of (e.data ?? []) as { amount: number | string; currency: string; project_id: string }[]) add(`ptrip:${x.project_id}`, x.currency, Number(x.amount));
        setLines([...m.values()].filter((x) => Number.isFinite(x.amount)));
      } catch { setLines([]); }
    })();
    return () => { live = false; };
  }, [year]);
  const sums = useMemo(() => {
    const t = new Map<string, number>();
    for (const l of lines ?? []) t.set(l.currency, (t.get(l.currency) ?? 0) + l.amount);
    return [...t.entries()];
  }, [lines]);
  if (!lines?.length) return null;
  const name = (ref: string) => trips.find((t) => t.ref === ref)?.label ?? "Trip";
  return (
    <Card data-testid="credit-while-traveling">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" aria-hidden="true" />Credit card while traveling · {year}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl bg-muted/50 p-3">{sums.map(([c, a]) => <p key={c} className="text-2xl font-bold">{formatCurrency(a, c)}</p>)}</div>
        <div className="divide-y">
          {[...lines].sort((a, b) => b.amount - a.amount).map((l) => (
            <div key={`${l.ref}|${l.currency}`} className="flex min-h-12 items-center gap-3 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{name(l.ref)}</span><span className="block text-xs text-muted-foreground">{l.n} {l.n === 1 ? "expense" : "expenses"}</span></span>
              <span className="shrink-0 text-sm font-bold">{formatCurrency(l.amount, l.currency)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
