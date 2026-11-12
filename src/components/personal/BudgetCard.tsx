"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Home, PiggyBank, Settings, ShoppingCart, Zap, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { BUDGET_AREAS, budgetView, pickBudget, spentByArea, type BudgetView, type SpentArea } from "@/lib/personal/budget";
import { fetchBudgets, fetchMonthInputs } from "@/lib/personal/budget-data";
import { formatCurrency, todayISO } from "@/lib/utils";

export const AREA_STYLE: Record<SpentArea, { color: string; icon: typeof Zap }> = {
  groceries: { color: "#2563eb", icon: ShoppingCart },
  utilities: { color: "#d97706", icon: Zap },
  quick: { color: "#16a34a", icon: Coins },
  house: { color: "#7c3aed", icon: Home },
  savings: { color: "#0d9488", icon: PiggyBank },
};
const BAR_AREAS: SpentArea[] = [...BUDGET_AREAS.map((a) => a.key), "savings"];

const STATE_TEXT = { ok: "On track", near: "Close to your budget", over: "Over budget" } as const;
const STATE_CLASS = {
  ok: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  near: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  over: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
} as const;

/** One bar for the whole budget: a colour for each area, a grey tick for today and a dark tick where the budget ends once you pass it. */
function TotalBar({ v }: { v: BudgetView }) {
  const scale = Math.max(v.spent, v.budget) || 1;
  return (
    <div className="relative" role="img" aria-label={`${formatCurrency(v.spent, v.currency)} of ${formatCurrency(v.budget, v.currency)} used`}>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
        {BAR_AREAS.map((k) => v.byArea[k] > 0 ? <div key={k} style={{ width: `${(v.byArea[k] / scale) * 100}%`, background: AREA_STYLE[k].color }} /> : null)}
      </div>
      {v.over > 0 && <div className="absolute -bottom-1 -top-1 w-0.5 bg-foreground" style={{ left: `${(v.budget / scale) * 100}%` }} />}
      <div className="absolute -bottom-1 -top-1 w-0.5 bg-muted-foreground/70" style={{ left: `${v.pace * 100}%` }} aria-hidden="true" />
    </div>
  );
}

function AreaRow({ k, v }: { k: SpentArea; v: BudgetView }) {
  const area = k === "savings" ? { label: "Savings" } : BUDGET_AREAS.find((a) => a.key === k)!;
  const { color, icon: Icon } = AREA_STYLE[k];
  const amount = v.byArea[k], limit = k === "savings" ? undefined : v.limits[k];
  const over = !!limit && amount > limit;
  return (
    <div className="border-t py-2.5" data-testid={`budget-area-${k}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${color}1a`, color }}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></span>
        <b className="flex-1 text-[15px]">{area.label}</b>
        <span className="text-[15px] tabular-nums"><b>{Math.round(amount).toLocaleString("en-US")}</b>{limit ? <span className="text-[13px] text-muted-foreground"> / {Math.round(limit).toLocaleString("en-US")}</span> : <span className="text-[13px] text-muted-foreground">{k === "savings" ? " set aside" : " no limit"}</span>}</span>
      </div>
      {limit ? (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" data-testid={`budget-area-bar-${k}`} data-over={over || undefined}>
          <div className="h-full" style={{ width: `${Math.min(100, (amount / limit) * 100)}%`, background: over ? "#dc2626" : color }} />
        </div>
      ) : null}
    </div>
  );
}

/** The monthly budget on Personal: what is left, a bar of what you spent, and each area with its optional limit. */
export function BudgetCard() {
  const [view, setView] = useState<BudgetView | null>(null);
  const [none, setNone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const today = todayISO(), month = `${today.slice(0, 7)}-01`;
      const { rows, missing } = await fetchBudgets(supabase);
      if (!alive) return;
      if (missing) return setHidden(true);
      const setting = pickBudget(rows, month);
      if (!setting) return setNone(true);
      const inputs = await fetchMonthInputs(supabase, month);
      if (alive) setView(budgetView(setting, spentByArea(inputs, setting.currency), today));
    })().catch(() => { if (alive) setHidden(true); });
    return () => { alive = false; };
  }, []);

  if (hidden) return null;
  if (none) {
    return (
      <Link href="/personal/budget" className="block lg:col-span-2" data-testid="budget-empty">
        <Card className="flex items-center gap-3 rounded-2xl px-4 py-3 md:px-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Coins className="h-[22px] w-[22px]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><b className="block text-base">Set a monthly budget</b><span className="block text-[13px] text-muted-foreground">See how your spending compares, in one bar.</span></span>
          <span className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Set</span>
        </Card>
      </Link>
    );
  }
  if (!view) return <Card className="min-h-[220px] rounded-2xl lg:col-span-2" aria-hidden="true">&nbsp;</Card>;

  const month = new Date(`${todayISO().slice(0, 7)}-01T12:00:00`).toLocaleString("en-US", { month: "long" });
  return (
    <Card className="rounded-2xl p-4 md:p-5 lg:col-span-2" data-testid="budget-card" data-state={view.state}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{month} budget</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_CLASS[view.state]}`} data-testid="budget-state">{view.state === "ok" && <Check className="h-3 w-3" aria-hidden="true" />}{STATE_TEXT[view.state]}</span>
      </div>
      <p className="mt-2.5 text-[30px] font-bold leading-none tabular-nums" data-testid="budget-headline">
        {view.over > 0 ? <>{formatCurrency(view.over, view.currency)} <span className="text-sm font-medium text-muted-foreground">over {formatCurrency(view.budget, view.currency)}</span></> : <>{formatCurrency(view.left, view.currency)} <span className="text-sm font-medium text-muted-foreground">left of {formatCurrency(view.budget, view.currency)}</span></>}
      </p>
      <div className="mb-1.5 mt-3"><TotalBar v={view} /></div>
      <p className="mb-1.5 text-[13px] text-muted-foreground" data-testid="budget-line">
        {formatCurrency(view.spent, view.currency)} spent · {view.daysLeft} {view.daysLeft === 1 ? "day" : "days"} left{view.perDay ? ` · about ${formatCurrency(view.perDay, view.currency)} a day` : ""}
      </p>
      {BUDGET_AREAS.map((a) => <AreaRow key={a.key} k={a.key} v={view} />)}
      {view.byArea.savings > 0 && <AreaRow k="savings" v={view} />}
      <Link href="/personal/budget" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary" data-testid="budget-set-link"><Settings className="h-4 w-4" aria-hidden="true" /> Set or change budget</Link>
    </Card>
  );
}
