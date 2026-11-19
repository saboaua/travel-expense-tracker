"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTripChoices } from "@/components/personal/TripPicker";
import { currenciesOf, filterReceipts, paidLabel, type Filter, type PaidWith } from "@/lib/paid-with";
import { formatDate } from "@/lib/utils";
import { Money } from "@/components/ui/money";

type R = { id: string; store: string; purchase_date: string; total: number; currency: string; prices_only?: boolean | null; paid_with?: PaidWith | null; trip_ref?: string | null };

const chip = (on: boolean) => `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/80 hover:bg-muted"}`;

/** Receipts by card and by trip: "what did I put on my credit card in Panama?". Shown once any receipt has a card or a trip. */
export function PaidFilter({ receipts, base = "/personal/groceries" }: { receipts: R[]; base?: string }) {
  const trips = useTripChoices();
  const [f, setF] = useState<Filter>({ paid: null, trip: null });
  const spend = useMemo(() => receipts.filter((r) => !r.prices_only), [receipts]);
  const used = useMemo(() => [...new Set(spend.map((r) => r.trip_ref).filter((x): x is string => !!x))], [spend]);
  const shown = useMemo(() => filterReceipts(spend, f).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)), [spend, f]);
  const totals = useMemo(() => currenciesOf(shown.map((r) => ({ currency: r.currency, amount: r.total }))).map((c) => ({ c, sum: shown.filter((r) => r.currency === c).reduce((t, r) => t + r.total, 0), n: shown.filter((r) => r.currency === c).length })), [shown]);
  if (!spend.some((r) => r.paid_with || r.trip_ref)) return null;
  const label = (ref: string) => trips.find((t) => t.ref === ref)?.label ?? "Trip";
  const types: { id: Filter["paid"]; text: string }[] = [{ id: null, text: "All" }, { id: "credit", text: "Credit card" }, { id: "debit", text: "Debit" }, { id: "cash", text: "Cash" }, { id: "none", text: "Not set" }];
  return (
    <Card data-testid="paid-filter">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" aria-hidden="true" />By card and trip</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Paid with">
          {types.map((t) => <button key={String(t.id)} type="button" aria-pressed={f.paid === t.id} onClick={() => setF({ ...f, paid: t.id })} className={chip(f.paid === t.id)} data-testid={`pf-paid-${t.id ?? "all"}`}>{t.text}</button>)}
        </div>
        {used.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Trip">
            <button type="button" aria-pressed={f.trip === null} onClick={() => setF({ ...f, trip: null })} className={chip(f.trip === null)}>Any trip</button>
            {used.map((ref) => <button key={ref} type="button" aria-pressed={f.trip === ref} onClick={() => setF({ ...f, trip: ref })} className={chip(f.trip === ref)} data-testid={`pf-trip-${ref}`}><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{label(ref)}</button>)}
            <button type="button" aria-pressed={f.trip === "none"} onClick={() => setF({ ...f, trip: "none" })} className={chip(f.trip === "none")}>Not on a trip</button>
          </div>
        )}
        <div className="rounded-xl bg-muted/50 p-3" data-testid="pf-total">
          {totals.length === 0 ? <p className="text-sm text-muted-foreground">No receipts for this choice.</p> : totals.map((t) => (
            <p key={t.c} className="flex items-baseline justify-between gap-3"><span className="text-xs text-muted-foreground">{t.n} receipt{t.n === 1 ? "" : "s"}</span><span className="text-2xl font-bold"><Money amount={t.sum} currency={t.c} /></span></p>
          ))}
        </div>
        <div className="space-y-1.5">
          {shown.slice(0, 20).map((r) => (
            <Link key={r.id} href={`${base}/${r.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-1 hover:bg-muted">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.store}</span><span className="block truncate text-xs text-muted-foreground">{formatDate(r.purchase_date)} · {paidLabel(r.paid_with)}{r.trip_ref ? ` · ${label(r.trip_ref)}` : ""}</span></span>
              <span className="shrink-0 text-sm font-semibold"><Money amount={r.total} currency={r.currency} /></span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
