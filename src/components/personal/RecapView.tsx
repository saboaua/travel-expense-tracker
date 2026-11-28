"use client";

import Link from "next/link";
import { ChevronRight, PiggyBank, TrendingDown, TrendingUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { monthName, previousMonth, type Recap } from "@/lib/personal/recap";
import { formatCurrency } from "@/lib/utils";

const GAP_TEXT = { under: "under budget", over: "over budget" } as const;

/**
 * A finished month in a few lines: spent against the budget, the biggest change, what cheaper prices could have saved.
 * The card on Personal shows it short with a close button; the full page adds every area.
 */
export function RecapView({ recap, full = false, onDismiss }: { recap: Recap; full?: boolean; onDismiss?: () => void }) {
  const { currency } = recap;
  const total = recap.areas.reduce((t, [, v]) => t + v, 0) || 1;
  return (
    <Card className="rounded-2xl p-4 md:p-5" data-testid="recap-card" data-state={recap.state}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">Your {recap.label}</h2>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Hide this recap" data-testid="recap-dismiss" className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent">
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-1">
        <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
          <span>Spent</span>
          {recap.budget != null && <span data-testid="recap-budget">Budget {formatCurrency(recap.budget, currency)}</span>}
        </div>
        <p className="text-[28px] font-bold leading-tight tabular-nums" data-testid="recap-spent"><Money amount={recap.spent} currency={currency} /></p>
        {recap.budget != null ? (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${recap.usedPct}% of the budget used`}>
              <div className={recap.state === "over" ? "h-full bg-red-600" : "h-full bg-green-600"} style={{ width: `${recap.usedPct}%` }} />
            </div>
            <p className={`mt-1.5 text-[13px] font-medium ${recap.state === "over" ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`} data-testid="recap-state">
              {recap.state !== "none" && recap.gap === 0 ? "Right on budget" : `${formatCurrency(recap.gap, currency)} ${GAP_TEXT[recap.state === "over" ? "over" : "under"]}`}
            </p>
          </>
        ) : (
          <Link href="/personal/budget" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary" data-testid="recap-set-budget">Set a monthly budget to compare next month</Link>
        )}
      </div>

      {(recap.change || recap.saving) && (
        <ul className="mt-3 space-y-3 border-t pt-3">
          {recap.change && (
            <li className="flex items-start gap-2.5" data-testid="recap-change">
              {recap.change.up ? <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> : <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />}
              <span className="min-w-0">
                <b className="block text-sm leading-snug">{recap.change.area} went {recap.change.up ? "up" : "down"} {Math.abs(recap.change.pct)}%</b>
                <span className="block text-xs leading-snug text-muted-foreground">{formatCurrency(recap.change.thisMonth, currency)} against {formatCurrency(recap.change.lastMonth, currency)} in {monthName(previousMonth(recap.month))}</span>
              </span>
            </li>
          )}
          {recap.saving && (
            <li className="flex items-start gap-2.5" data-testid="recap-saving">
              <PiggyBank className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              <span className="min-w-0">
                <b className="block text-sm leading-snug">You could have saved about {formatCurrency(recap.saving.amount, currency)}</b>
                <span className="block text-xs leading-snug text-muted-foreground">On {recap.saving.items} {recap.saving.items === 1 ? "item" : "items"} that were cheaper at another store you have shopped at</span>
              </span>
            </li>
          )}
        </ul>
      )}

      {full && (
        <ul className="mt-3 border-t" data-testid="recap-areas">
          {recap.areas.map(([name, amount]) => (
            <li key={name} className="flex min-h-11 items-center gap-3 border-b py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round((amount / total) * 100)}%</span>
              <span className="w-28 text-right text-sm tabular-nums"><Money amount={amount} currency={currency} /></span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!full && (
          <Link href="/personal/recap" data-testid="recap-full" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border px-3 text-sm font-semibold hover:bg-accent">See the full month <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        )}
        <Link href="/personal/reports" data-testid="recap-where" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold hover:bg-accent">Where it went</Link>
      </div>
    </Card>
  );
}
