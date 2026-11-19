"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { currenciesOf, normPaid, paidTotals, type Pay } from "@/lib/paid-with";
import { formatCurrency } from "@/lib/utils";

type Receipt = { total: number | string; currency: string; paid_with: string | null; prices_only?: boolean | null };

/**
 * How you paid on a trip: totals for credit card, debit and cash, from the personal expenses of a personal trip and from the
 * personal receipts tagged to it. On a business trip it shows only the personal receipts tagged to the trip, and never adds them to the trip's own totals.
 */
export function HowYouPaid({ tripRef, expenses = [], title = "How you paid", hint }: { tripRef: string; expenses?: { amount: number | string; currency: string; paid_with?: string | null }[]; title?: string; hint?: string }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data, error } = await createClient().from("grocery_receipts").select("total, currency, paid_with, prices_only").eq("trip_ref", tripRef).limit(500);
        if (!live || error) return;
        setReceipts(((data ?? []) as Receipt[]).filter((r) => !r.prices_only));
      } catch { /* offline, or the migration has not run: nothing to show */ }
    })();
    return () => { live = false; };
  }, [tripRef]);

  const rows: Pay[] = useMemo(() => [
    ...expenses.map((e) => ({ paid_with: normPaid(e.paid_with), amount: Number(e.amount), currency: e.currency })),
    ...receipts.map((r) => ({ paid_with: normPaid(r.paid_with), amount: Number(r.total), currency: r.currency })),
  ].filter((r) => Number.isFinite(r.amount)), [expenses, receipts]);
  const currencies = currenciesOf(rows);
  if (!rows.some((r) => r.paid_with) || !currencies.length) return null;

  return (
    <Card data-testid="how-you-paid">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle>{hint && <CardDescription>{hint}</CardDescription>}</CardHeader>
      <CardContent className="space-y-5">
        {currencies.map((cur) => {
          const t = paidTotals(rows, cur);
          const lines = [
            { k: "credit" as const, label: "Credit card", Icon: CreditCard, color: "bg-blue-600" },
            { k: "debit" as const, label: "Debit card", Icon: Landmark, color: "bg-sky-500" },
            { k: "cash" as const, label: "Cash", Icon: Banknote, color: "bg-emerald-500" },
            { k: "none" as const, label: "Not set", Icon: null, color: "bg-slate-400" },
          ].filter((l) => t.count[l.k] > 0);
          return (
            <div key={cur} className="space-y-3" data-testid={`paid-${cur}`}>
              {lines.map((l) => {
                const pct = t.total > 0 ? Math.round((t[l.k] / t.total) * 100) : 0;
                return (
                  <div key={l.k} data-testid={`paid-line-${l.k}`}>
                    <div className="flex items-center gap-3">
                      {l.Icon ? <l.Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" />}
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{l.label}</p><p className="text-xs text-muted-foreground">{t.count[l.k]} {t.count[l.k] === 1 ? "expense" : "expenses"}</p></div>
                      <div className="text-right"><p className="text-sm font-bold">{formatCurrency(t[l.k], cur)}</p><p className="text-xs text-muted-foreground">{pct}%</p></div>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${l.color}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
