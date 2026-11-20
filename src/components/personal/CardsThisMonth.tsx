"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, ChevronRight, CreditCard, Landmark, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_COLS, SUBSCRIPTION_COLS_PAY, isMissingColumn } from "@/lib/columns";
import { paidTotals, type PaidWith } from "@/lib/paid-with";
import { subsOnCards, type Sub } from "@/lib/subscriptions";
import { Money } from "@/components/ui/money";

type Rcpt = { total: number | string; currency: string; paid_with?: PaidWith | null; prices_only?: boolean | null };
const LINES = [
  { k: "credit" as const, label: "Credit card", Icon: CreditCard, tone: "text-blue-600 bg-blue-600/10", bar: "bg-blue-600" },
  { k: "debit" as const, label: "Debit card", Icon: Landmark, tone: "text-sky-600 bg-sky-500/10", bar: "bg-sky-500" },
  { k: "cash" as const, label: "Cash", Icon: Banknote, tone: "text-emerald-600 bg-emerald-500/10", bar: "bg-emerald-500" },
  { k: "none" as const, label: "Not set", Icon: null, tone: "text-slate-500 bg-slate-500/10", bar: "bg-slate-400" },
];

/**
 * What went on each card this month: the receipts on this page and, on Shopping, the subscriptions charged in the month, by how they were paid.
 * `receipts` are the month's receipts in the chosen currency.
 */
export function CardsThisMonth({ receipts, month, currency, label, withSubs }: { receipts: Rcpt[]; month: string; currency: string; label: string; withSubs: boolean }) {
  const [subs, setSubs] = useState<Sub[]>([]);
  useEffect(() => {
    if (!withSubs) return;
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        let r = await supabase.from("subscriptions").select(SUBSCRIPTION_COLS_PAY).eq("status", "active").limit(200);
        if (r.error && isMissingColumn(r.error)) r = (await supabase.from("subscriptions").select(SUBSCRIPTION_COLS).eq("status", "active").limit(200)) as unknown as typeof r;
        if (!live || r.error) return;
        setSubs(((r.data ?? []) as unknown as Sub[]).map((x) => ({ ...x, price: Number(x.price), split_count: Number(x.split_count) || 1 })));
      } catch { /* offline: the receipts still show */ }
    })();
    return () => { live = false; };
  }, [withSubs]);

  const rows = useMemo(() => receipts.filter((r) => !r.prices_only).map((r) => ({ paid_with: r.paid_with ?? null, amount: Number(r.total), currency: r.currency })), [receipts]);
  const rec = useMemo(() => paidTotals(rows, currency), [rows, currency]);
  const sub = useMemo(() => subsOnCards(subs, month, currency), [subs, month, currency]);

  const amount = (k: (typeof LINES)[number]["k"]) => Math.round((rec[k] + (k === "none" ? 0 : sub.total[k])) * 100) / 100;
  const shown = LINES.filter((l) => amount(l.k) > 0);
  const total = shown.reduce((s, l) => s + amount(l.k), 0);
  if (!shown.length) return null;
  const creditSubs = sub.items.filter((i) => i.paid === "credit");

  return (
    <section data-testid="cards-this-month" className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-base font-bold">On your cards this month</h2>
      <p className="text-sm text-muted-foreground">{withSubs ? `${label} and subscriptions, by how you paid.` : `${label}, by how you paid.`}</p>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {shown.map((l) => <div key={l.k} className={l.bar} style={{ width: `${(amount(l.k) / total) * 100}%` }} />)}
      </div>
      <div className="mt-2">
        {shown.map((l) => {
          const subTotal = l.k === "none" ? 0 : sub.total[l.k];
          const subCount = l.k === "none" ? 0 : sub.items.filter((i) => i.paid === l.k).length;
          return (
            <div key={l.k} data-testid={`cards-line-${l.k}`} className="border-t py-3 first:border-t-0">
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${l.tone}`}>{l.Icon ? <l.Icon className="h-5 w-5" aria-hidden="true" /> : null}</span>
                <p className="min-w-0 flex-1 text-[15px] font-bold">{l.label}</p>
                <div className="text-right"><p className="font-bold"><Money amount={amount(l.k)} currency={currency} /></p><p className="text-xs text-muted-foreground">{Math.round((amount(l.k) / total) * 100)}%</p></div>
              </div>
              {subTotal > 0 && (
                <div className="ml-[52px] mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                  <p className="flex justify-between"><span>{label}</span><span className="font-semibold text-foreground"><Money amount={rec[l.k as PaidWith]} currency={currency} /></span></p>
                  <p className="flex justify-between"><span>Subscriptions ({subCount})</span><span className="font-semibold text-foreground"><Money amount={subTotal} currency={currency} /></span></p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {withSubs && creditSubs.length > 0 && (
        <Link href="/personal/subscriptions" data-testid="cards-subs-link" className="flex min-h-11 items-center gap-2 border-t pt-2 text-sm font-semibold text-primary">
          <Repeat className="h-4 w-4" aria-hidden="true" /><span className="flex-1">See the {creditSubs.length} subscription{creditSubs.length === 1 ? "" : "s"} on your credit card</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {withSubs && sub.items.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Subscriptions are counted in the month they are charged, as they are set now.</p>}
    </section>
  );
}
