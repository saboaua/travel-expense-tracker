"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { useTripChoices } from "@/components/personal/TripPicker";
import { filterReceipts, type Filter, type PaidWith } from "@/lib/paid-with";
import { Money } from "@/components/ui/money";

type R = { id: string; currency: string; total: number; prices_only?: boolean | null; paid_with?: PaidWith | null; trip_ref?: string | null };

export const NO_FILTER: Filter = { paid: null, trip: null };
const chip = (on: boolean) => `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/80 hover:bg-muted"}`;

/** The receipts that pass the card and trip choice. */
export const applyPaidFilter = <T extends R>(rows: T[], f: Filter): T[] => filterReceipts(rows, f);

/** Card and trip choices that sit inside the month's receipt list: "what did I put on my credit card?". Shown once any receipt has a card or a trip. */
export function PaidFilter({ all, shown, filter, onChange }: { all: R[]; shown: R[]; filter: Filter; onChange: (f: Filter) => void }) {
  const trips = useTripChoices();
  const spend = useMemo(() => all.filter((r) => !r.prices_only), [all]);
  const used = useMemo(() => [...new Set(spend.map((r) => r.trip_ref).filter((x): x is string => !!x))], [spend]);
  if (!spend.some((r) => r.paid_with || r.trip_ref)) return null;
  const label = (ref: string) => trips.find((t) => t.ref === ref)?.label ?? "Trip";
  const types: { id: Filter["paid"]; text: string }[] = [{ id: null, text: "All" }, { id: "credit", text: "Credit card" }, { id: "debit", text: "Debit" }, { id: "cash", text: "Cash" }, { id: "none", text: "Not set" }];
  const active = filter.paid !== null || filter.trip !== null;
  const counted = shown.filter((r) => !r.prices_only);
  const sum = counted.reduce((t, r) => t + r.total, 0);
  const cur = counted[0]?.currency;
  return (
    <div className="space-y-2" data-testid="paid-filter">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Paid with">
        {types.map((t) => <button key={String(t.id)} type="button" aria-pressed={filter.paid === t.id} onClick={() => onChange({ ...filter, paid: t.id })} className={chip(filter.paid === t.id)} data-testid={`pf-paid-${t.id ?? "all"}`}>{t.text}</button>)}
      </div>
      {used.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Trip">
          <button type="button" aria-pressed={filter.trip === null} onClick={() => onChange({ ...filter, trip: null })} className={chip(filter.trip === null)}>Any trip</button>
          {used.map((ref) => <button key={ref} type="button" aria-pressed={filter.trip === ref} onClick={() => onChange({ ...filter, trip: ref })} className={chip(filter.trip === ref)} data-testid={`pf-trip-${ref}`}><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{label(ref)}</button>)}
          <button type="button" aria-pressed={filter.trip === "none"} onClick={() => onChange({ ...filter, trip: "none" })} className={chip(filter.trip === "none")}>Not on a trip</button>
        </div>
      )}
      {active && (
        <div className="rounded-xl bg-muted/50 p-3" data-testid="pf-total">
          {counted.length === 0 || !cur ? <p className="text-sm text-muted-foreground">No receipts for this choice.</p> : (
            <p className="flex items-baseline justify-between gap-3"><span className="text-xs text-muted-foreground">{counted.length} receipt{counted.length === 1 ? "" : "s"}</span><span className="text-2xl font-bold"><Money amount={sum} currency={cur} /></span></p>
          )}
        </div>
      )}
    </div>
  );
}
