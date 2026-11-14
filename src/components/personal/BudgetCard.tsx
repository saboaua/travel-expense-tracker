"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Coins, Dices, FileCheck2, Home, Landmark, CreditCard, PiggyBank, Settings, ShoppingCart, Zap, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { BUDGET_AREAS, budgetView, pickBudget, spentByArea, uncountedEntries, utilitiesDueAmount, type BudgetView, type SpentArea } from "@/lib/personal/budget";
import { fetchBudgets, fetchFixedCosts, fetchMonthInputs } from "@/lib/personal/budget-data";
import { CATEGORY_LABEL, configuredCategories, nextYearly, KIND_LABEL, MONTHS, type FixedCategory, type FixedCost } from "@/lib/personal/fixed-costs";
import { convert } from "@/lib/personal/money";
import { formatCurrency, todayISO } from "@/lib/utils";

export const AREA_STYLE: Record<SpentArea, { color: string; icon: typeof Zap }> = {
  groceries: { color: "#2563eb", icon: ShoppingCart },
  utilities: { color: "#d97706", icon: Zap },
  quick: { color: "#16a34a", icon: Coins },
  house: { color: "#7c3aed", icon: Home },
  savings: { color: "#0d9488", icon: PiggyBank },
};
const AREA_HREF: Record<SpentArea, string> = { groceries: "/personal/groceries", utilities: "/personal/utilities", quick: "/personal/spend", house: "/personal/house", savings: "/personal/savings" };
const BAR_AREAS: SpentArea[] = [...BUDGET_AREAS.map((a) => a.key), "savings"];
/** Fixed costs: loans, insurances, credit card and gambling each get a row and a colour in the bar */
const FIXED_STYLE: Record<FixedCategory, { color: string; icon: typeof Zap; href: string }> = {
  loans: { color: "#0d9488", icon: Landmark, href: "/personal/fixed" },
  insurances: { color: "#0891b2", icon: FileCheck2, href: "/personal/fixed" },
  cards: { color: "#6366f1", icon: CreditCard, href: "/personal/fixed/credit-card" },
  gambling: { color: "#dc2626", icon: Dices, href: "/personal/fixed/gambling" },
};
const FIXED_ORDER: FixedCategory[] = ["loans", "insurances", "cards", "gambling"];

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
        {FIXED_ORDER.map((k) => (v.byArea[k] ?? 0) > 0 ? <div key={k} style={{ width: `${((v.byArea[k] ?? 0) / scale) * 100}%`, background: FIXED_STYLE[k].color }} /> : null)}
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
    <Link href={AREA_HREF[k]} className="block min-h-12 border-t py-2.5 hover:bg-accent/40" data-testid={`budget-area-${k}`} aria-label={`${area.label}: open`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${color}1a`, color }}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></span>
        <b className="flex-1 text-[15px]">{area.label}</b>
        <span className="text-[15px] tabular-nums"><b>{Math.round(amount).toLocaleString("en-US")}</b>{limit ? <span className="text-[13px] text-muted-foreground"> / {Math.round(limit).toLocaleString("en-US")}</span> : <span className="text-[13px] text-muted-foreground">{k === "savings" ? " set aside" : " no limit"}</span>}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {limit ? (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" data-testid={`budget-area-bar-${k}`} data-over={over || undefined}>
          <div className="h-full" style={{ width: `${Math.min(100, (amount / limit) * 100)}%`, background: over ? "#dc2626" : color }} />
        </div>
      ) : null}
    </Link>
  );
}

function FixedRow({ k, v, limit }: { k: FixedCategory; v: BudgetView; limit: number | null }) {
  const { color, icon: Icon, href } = FIXED_STYLE[k];
  const amount = v.byArea[k] ?? 0;
  const over = !!limit && amount > limit;
  return (
    <Link href={href} className="block min-h-12 border-t py-2.5 hover:bg-accent/40" data-testid={`budget-area-${k}`} aria-label={`${CATEGORY_LABEL[k]}: open`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${color}1a`, color }}><Icon className="h-[17px] w-[17px]" aria-hidden="true" /></span>
        <b className="flex-1 text-[15px]">{CATEGORY_LABEL[k]}</b>
        <span className="text-[15px] tabular-nums"><b className={over ? "text-red-700 dark:text-red-300" : ""}>{Math.round(amount).toLocaleString("en-US")}</b>{limit ? <span className={`text-[13px] ${over ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}> / {Math.round(limit).toLocaleString("en-US")} limit</span> : null}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}

/** The monthly budget on Personal: what is left, a bar of what you spent, and each area with its optional limit. */
export function BudgetCard() {
  const [view, setView] = useState<BudgetView | null>(null);
  const [due, setDue] = useState(0);
  const [none, setNone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [costs, setCosts] = useState<FixedCost[]>([]);

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
      const [inputs, fx] = await Promise.all([fetchMonthInputs(supabase, month), fetchFixedCosts(supabase)]);
      if (!alive) return;
      setCosts(fx.costs);
      setDue(utilitiesDueAmount(inputs, setting.currency));
      setView(budgetView(setting, spentByArea(inputs, setting.currency), today, uncountedEntries(inputs, setting.currency)));
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

  const soon = comingUpNote(costs, todayISO(), view.currency);
  const month = new Date(`${todayISO().slice(0, 7)}-01T12:00:00`).toLocaleString("en-US", { month: "long" });
  return (
    <Card className="rounded-2xl p-4 md:p-5 lg:col-span-2" data-testid="budget-card" data-state={view.state}>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{month} budget</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_CLASS[view.state]}`} data-testid="budget-state">{view.state === "ok" && <Check className="h-3 w-3" aria-hidden="true" />}{STATE_TEXT[view.state]}</span>
      </div>
      <p className="mt-2.5 text-[30px] font-bold leading-none tabular-nums" data-testid="budget-headline">
        {view.over > 0 ? <><span className="text-red-700 dark:text-red-300">Over by {formatCurrency(view.over, view.currency)}</span> <span className="text-sm font-medium text-muted-foreground">of {formatCurrency(view.budget, view.currency)}</span></> : <>{formatCurrency(view.left, view.currency)} <span className="text-sm font-medium text-muted-foreground">left of {formatCurrency(view.budget, view.currency)}</span></>}
      </p>
      <div className="mb-1.5 mt-3"><TotalBar v={view} /></div>
      <p className="mb-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground" data-testid="budget-legend">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-muted-foreground/70" aria-hidden="true" />Where today is in the month</span>
        {view.over > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" aria-hidden="true" />Your budget</span>}
      </p>
      <p className="mb-1.5 text-[13px] text-muted-foreground" data-testid="budget-line">
        {formatCurrency(view.spent, view.currency)} spent · {view.daysLeft} {view.daysLeft === 1 ? "day" : "days"} left{view.perDay ? ` · about ${formatCurrency(view.perDay, view.currency)} a day` : ""}
      </p>
      {BUDGET_AREAS.map((a) => <AreaRow key={a.key} k={a.key} v={view} />)}
      {view.byArea.savings > 0 && <AreaRow k="savings" v={view} />}
      {FIXED_ORDER.filter((k) => (view.byArea[k] ?? 0) > 0 || configuredCategories(costs).includes(k)).map((k) => <FixedRow key={k} k={k} v={view} limit={k === "gambling" ? gamblingLimit(costs, view.currency) : null} />)}
      {view.byArea.savings > 0 && <p className="mt-1 rounded-lg bg-teal-50 px-3 py-2 text-xs leading-snug text-teal-900 dark:bg-teal-950 dark:text-teal-100" data-testid="budget-savings-note">Savings counts as spending: that money is already set aside for your plans.</p>}
      {due > 0 && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="budget-due-note">{formatCurrency(due, view.currency)} more is due in utilities. It counts once you pay it.</p>}
      {soon && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="budget-fixed-due-note">{soon}</p>}
      {view.uncounted > 0 && <p className="mb-1 text-xs text-muted-foreground" data-testid="budget-uncounted">{view.uncounted} {view.uncounted === 1 ? "entry is" : "entries are"} in another currency and not counted here.</p>}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
        <Link href="/personal/budget" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary" data-testid="budget-set-link"><Settings className="h-4 w-4" aria-hidden="true" /> Set or change budget</Link>
        <Link href="/personal/fixed" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary" data-testid="budget-fixed-link">Fixed costs <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
    </Card>
  );
}

/** The most you can afford to gamble each month, in the budget's currency */
function gamblingLimit(costs: FixedCost[], currency: BudgetView["currency"]): number | null {
  const g = costs.find((c) => c.kind === "gambling" && c.active && c.amount > 0);
  return g ? convert(g.amount, g.currency, currency) : null;
}

/** "AWG 1,020 car insurance is due 15 Mar. It counts when you pay it." for yearly bills due in the next 45 days */
function comingUpNote(costs: FixedCost[], today: string, currency: BudgetView["currency"]): string | null {
  const t = Date.parse(`${today}T12:00:00Z`);
  const parts: string[] = [];
  for (const c of costs) {
    const n = nextYearly(c, today);
    if (!n) continue;
    const days = Math.round((Date.parse(`${n.date}T12:00:00Z`) - t) / 86400000);
    if (days > 45) continue;
    parts.push(`${formatCurrency(convert(n.amount, c.currency, currency) ?? n.amount, currency)} ${KIND_LABEL[c.kind].toLowerCase()} is due ${Number(n.date.slice(8, 10))} ${MONTHS[Number(n.date.slice(5, 7)) - 1]}`);
  }
  return parts.length ? `${parts.join(". ")}. It counts in the month it is due.` : null;
}
