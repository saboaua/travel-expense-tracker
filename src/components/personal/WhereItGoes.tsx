"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { spentByArea, uncountedEntries, utilitiesDueAmount, type SpentArea } from "@/lib/personal/budget";
import { fetchMonthInputs } from "@/lib/personal/budget-data";
import { slices, pieSlices } from "@/lib/personal/where-it-goes";
import { AREA_STYLE } from "@/components/personal/BudgetCard";
import { formatCurrency, todayISO } from "@/lib/utils";
import { dominantCurrency, type BudgetCurrency } from "@/lib/personal/money";

const LABEL: Record<SpentArea, string> = { groceries: "Groceries", utilities: "Utilities", quick: "Quick spend", house: "House & repairs", savings: "Savings" };
const HREF: Record<SpentArea, string> = { groceries: "/personal/groceries", utilities: "/personal/utilities", quick: "/personal/spend", house: "/personal/house", savings: "/personal/savings" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Where this month's money went: groceries, utilities, savings, house and quick spends, each counted once (same rules as the budget). */
export function WhereItGoes({ currency }: { currency?: BudgetCurrency | null }) {
  const [data, setData] = useState<{ by: Record<SpentArea, number>; uncounted: number; due: number; cur: BudgetCurrency } | null>(null);
  const today = todayISO(), month = `${today.slice(0, 7)}-01`;
  const monthName = MONTHS[Number(today.slice(5, 7)) - 1];

  useEffect(() => {
    if (currency === null) return; // the page is still working out its currency; undefined means choose by what the month uses
    let alive = true;
    (async () => {
      const inputs = await fetchMonthInputs(createClient(), month);
      const cur = currency ?? dominantCurrency([...inputs.groceries, ...inputs.spends]);
      if (alive) setData({ by: spentByArea(inputs, cur), uncounted: uncountedEntries(inputs, cur), due: utilitiesDueAmount(inputs, cur), cur });
    })().catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [currency, month]);

  const list = useMemo(() => (data ? slices(data.by) : []), [data]);
  const total = list.reduce((t, s) => t + s.value, 0);
  const paths = useMemo(() => pieSlices(list), [list]);

  if (!data) return <Card className="min-h-[120px] rounded-2xl md:col-span-2" aria-hidden="true">&nbsp;</Card>;
  const currencyShown = data.cur;
  const head = (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where it goes</h2>
      <span className="text-[13px] font-semibold text-muted-foreground">{monthName}</span>
    </div>
  );
  return (
    <Card className="rounded-2xl p-4 md:col-span-2 md:p-5" data-testid="where-it-goes">
      {head}
      {total <= 0 ? (
        <div className="py-6 text-center" data-testid="where-empty">
          <p className="text-[15px] font-semibold">Nothing recorded in {monthName} yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Scan a receipt, add a spend or pay a bill and it shows up here.</p>
        </div>
      ) : (
        <div className="lg:flex lg:items-center lg:gap-8">
          <div className="mt-3 flex flex-col items-center lg:mt-0 lg:shrink-0">
            <svg viewBox="0 0 200 200" width="220" height="220" role="img" aria-label={`Where ${monthName} went: ${list.map((s) => `${LABEL[s.key]} ${s.percent}%`).join(", ")}`} data-testid="where-pie">
              {paths.map((p) => <path key={p.key} d={p.d} fill={AREA_STYLE[p.key].color} />)}
              {paths.filter((p) => p.label).map((p) => <text key={`t${p.key}`} x={p.label!.x} y={p.label!.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">{p.percent}%</text>)}
            </svg>
            <p className="mt-1 text-center text-[13px] text-muted-foreground">Spent in {monthName} <b className="ml-1 text-lg tabular-nums text-foreground" data-testid="where-total">{formatCurrency(total, currencyShown)}</b></p>
          </div>
          <ul className="mt-3 min-w-0 flex-1 lg:mt-0" data-testid="where-list">
            {list.map((s, i) => (
              <li key={s.key} className={i ? "border-t" : ""}>
                <Link href={HREF[s.key]} data-testid={`where-${s.key}`} className="flex min-h-12 items-center gap-2.5 py-2 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: AREA_STYLE[s.key].color }} aria-hidden="true" />
                  <b className="flex-1 text-[15px]">{LABEL[s.key]}</b>
                  <b className="text-[15px] tabular-nums">{formatCurrency(s.value, currencyShown)}</b>
                  <span className="w-10 text-right text-[13px] font-bold tabular-nums text-muted-foreground">{s.percent}%</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.due > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="where-due">{formatCurrency(data.due, currencyShown)} of utilities is due and not counted until you pay it.</p>}
      {data.uncounted > 0 && <p className="mt-2 text-xs text-muted-foreground" data-testid="where-uncounted">{data.uncounted} {data.uncounted === 1 ? "entry is" : "entries are"} in another currency and not counted here.</p>}
    </Card>
  );
}
