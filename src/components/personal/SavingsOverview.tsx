"use client";

import { setupNeeded } from "@/lib/setup-message";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PiggyBank, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { fetchSavings } from "@/lib/personal/savings-data";
import type { BudgetCurrency } from "@/lib/personal/budget";
import { deposits, isPaused, monthlyTotals, progressPct, remaining, ruleText, savedSoFar, savingsSummary, type SavingsEvent, type SavingsPlan } from "@/lib/personal/savings";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

const TEAL = "#0d9488";
export const MONTH_SHORT = (m: string) => new Date(`${m}T12:00:00`).toLocaleString("en-US", { month: "short" });

export function PlanCard({ plan, events, today }: { plan: SavingsPlan; events: SavingsEvent[]; today: string }) {
  const saved = savedSoFar(plan, events, today);
  const pct = progressPct(saved, plan.goal);
  const left = remaining(plan, events, today);
  const next = deposits(plan, events, today).find((d) => d.status === "coming");
  return (
    <Link href={`/personal/savings/plan?id=${plan.id}`} className="block rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md" data-testid="savings-plan">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#ccfbf1", color: TEAL }}><PiggyBank className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><b className="block truncate text-base">{plan.name}</b><span className="block text-[13px] text-muted-foreground">{isPaused(plan) ? "Paused" : ruleText(plan)}</span></span>
        <span className="text-right"><b className="block text-base tabular-nums">{formatCurrency(plan.amount, plan.currency)}</b><span className="text-xs text-muted-foreground">a month</span></span>
      </div>
      {pct != null ? (
        <div className="mt-2.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${pct}%`, background: TEAL }} /></div>
          <div className="mt-1 flex text-xs text-muted-foreground"><span className="flex-1">{formatCurrency(saved, plan.currency)} of {formatCurrency(plan.goal ?? 0, plan.currency)}</span><span>{pct}%</span></div>
        </div>
      ) : <p className="mt-2 text-[13px] text-muted-foreground">{formatCurrency(saved, plan.currency)} saved so far</p>}
      <p className="mt-2 text-xs text-muted-foreground">{next ? `Next deposit ${formatDate(next.date)}` : isPaused(plan) ? "No deposits while paused" : "No more deposits"}{left && left.count > 0 ? ` · ${left.count} deposits to go` : ""}</p>
    </Link>
  );
}

/** Everything you save: the total so far, a chart of it month by month and each plan. */
export function SavingsOverview() {
  const today = todayISO();
  const [data, setData] = useState<{ plans: SavingsPlan[]; events: SavingsEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSavings(createClient()).then((r) => {
      if (!alive) return;
      if (r.missing) setError(setupNeeded("Savings","migration_savings.sql"));
      else if (r.failed) setError("Could not load your savings. Check your connection.");
      setData({ plans: r.plans, events: r.events });
    });
    return () => { alive = false; };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const sum = savingsSummary(data.plans, data.events, today);
    const currency: BudgetCurrency = sum?.currency ?? "AWG";
    return { currency, total: sum?.saved ?? 0, monthly: sum?.monthly ?? 0, chart: monthlyTotals(data.plans, data.events, today, currency) };
  }, [data, today]);

  const max = Math.max(...(view?.chart.map((c) => c.total) ?? [0]), 1);
  const btn = "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary/90";
  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href="/personal" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Personal</Link>
      <h1 className="text-[26px] font-bold leading-tight">Savings</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">What you set aside each month, and what you have saved so far.</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      {data && data.plans.length === 0 && !error ? (
        <div className="mt-4 space-y-3" data-testid="savings-empty">
          <div className="rounded-2xl border bg-card p-4 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#ccfbf1", color: TEAL }}><PiggyBank className="h-7 w-7" aria-hidden="true" /></span>
            <p className="mt-2.5 text-lg font-bold">Put money aside every month</p>
            <p className="mt-1.5 text-sm leading-snug text-muted-foreground">Set an amount once. Lifolio counts it every month and keeps your total, so you can see how much you have saved.</p>
            <Link href="/personal/savings/add" className={`${btn} mt-4`} data-testid="savings-add"><Plus className="h-4 w-4" aria-hidden="true" /> Add a savings plan</Link>
          </div>
          <div className="rounded-2xl border bg-card p-4"><b className="block text-[15px]">Already saving somewhere?</b><p className="mt-1.5 text-sm leading-snug text-muted-foreground">When you add a plan, turn on <b className="text-foreground">I already have savings</b> and type what you have so far. The monthly amount starts from the date you choose.</p></div>
        </div>
      ) : data && view ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved so far</p>
            <p className="mt-1.5 text-[34px] font-bold leading-none tabular-nums" data-testid="savings-total">{formatCurrency(view.total, view.currency)}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">across {data.plans.length} {data.plans.length === 1 ? "plan" : "plans"} · <b className="text-foreground">{formatCurrency(view.monthly, view.currency)}</b> goes in each month</p>
            <div className="mt-3 flex h-[110px] items-end gap-2.5" role="img" aria-label="Total saved at the end of each month">
              {view.chart.map((c, i) => (
                <div key={c.month} className="flex h-full flex-1 flex-col items-center justify-end">
                  <span className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{c.total >= 1000 ? `${(c.total / 1000).toFixed(1)}k` : Math.round(c.total)}</span>
                  <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (c.total / max) * 80)}px`, background: i === view.chart.length - 1 ? TEAL : "#99f6e4" }} />
                  <span className="mt-1 text-[11px] text-muted-foreground">{MONTH_SHORT(c.month)}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Total saved at the end of each month.</p>
          </div>
          <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your plans</p>
          {data.plans.map((p) => <PlanCard key={p.id} plan={p} events={data.events} today={today} />)}
          <Link href="/personal/savings/add" className={btn} data-testid="savings-add"><Plus className="h-4 w-4" aria-hidden="true" /> Add a savings plan</Link>
          <p className="text-[13px] leading-snug text-muted-foreground">Each plan puts its amount aside every month by itself. It counts as spending in your monthly budget, in its own Savings line, because that money is already set aside.</p>
        </div>
      ) : <p className="mt-6 text-sm text-muted-foreground">&nbsp;</p>}
    </div>
  );
}
