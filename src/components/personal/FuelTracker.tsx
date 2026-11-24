"use client";

import { TileButton } from "@/components/ui/TileButton";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Fuel, Plus } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Money } from "@/components/ui/money";
import { createClient } from "@/lib/supabase/client";
import { FUEL_COLS, fillupSub, fuelCurrency, fuelMonths, fuelSummary, monthBack, unitShort, type FuelRow, type FuelUnit } from "@/lib/personal/fuel";
import { monthLabel } from "@/lib/personal/utilities";
import { formatDate, todayISO } from "@/lib/utils";
import { browserOutbox } from "@/lib/outbox";
import { isRowSave } from "@/lib/row-outbox";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

type Listed = FuelRow & { waiting?: boolean };

/** Fuel (Personal): what you spent each time you filled the tank, with the month's total, the average price and the last months. */
export function FuelTracker() {
  const [rows, setRows] = useState<Listed[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [unit, setUnit] = useState<FuelUnit>("L");
  const today = todayISO();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);

  useEffect(() => { try { setUnit(localStorage.getItem("fuel-unit") === "gal" ? "gal" : "L"); } catch { /* fine */ } }, []);
  const load = useCallback(async () => {
    const supabase = createClient();
    const since = monthBack(today, 11);
    const { data, error } = await supabase.from("fuel_fillups").select(FUEL_COLS).gte("fill_date", since).order("fill_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
    const waiting = (await browserOutbox.list().catch(() => []))
      .filter((i) => isRowSave(i) && i.table === "fuel_fillups" && i.isNew)
      .map((i) => ({ id: i.id, ...(isRowSave(i) ? i.row : {}), waiting: true }) as unknown as Listed);
    if (error && !waiting.length) { if (/relation|schema cache/i.test(error.message)) { setSetup(true); setRows([]); } else setRows(null); return; }
    setRows([...waiting, ...((data ?? []) as unknown as Listed[])].sort((a, b) => b.fill_date.localeCompare(a.fill_date)));
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const cur = useMemo(() => fuelCurrency(rows ?? []), [rows]);
  const inMonth = useMemo(() => (rows ?? []).filter((r) => r.fill_date.startsWith(month.slice(0, 7))), [rows, month]);
  const sum = useMemo(() => fuelSummary(inMonth, cur, unit), [inMonth, cur, unit]);
  const months = useMemo(() => fuelMonths(rows ?? [], cur, 6), [rows, cur]);
  const maxMonth = Math.max(...months.map((m) => m.total), 0) || 1;
  const thisMonth = `${today.slice(0, 7)}-01`;
  const card = "rounded-2xl border bg-card p-4";

  return (
    <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-28 md:p-8`}>
      <BackLink href="/personal">Personal</BackLink>
      <PageHeader title={<span className="flex items-center gap-3"><TileButton id="fuel" icon={Fuel} tone="projects" />Fuel</span>} description={monthLabel(month.slice(0, 7))} />
      {setup && <Alert>Run supabase/migration_fuel.sql in Supabase first.</Alert>}
      {rows == null && !setup && <Alert>Could not load your fill-ups. Check your connection.</Alert>}

      <div className="grid grid-cols-[1.3fr_1fr] gap-3" data-testid="fuel-summary">
        <div className={card}>
          <p className="text-[13px] text-muted-foreground">Spent on fuel</p>
          <p className="mt-1 text-[28px] leading-none"><Money amount={sum?.total ?? 0} currency={cur} /></p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{sum ? `${sum.count} fill-up${sum.count === 1 ? "" : "s"}` : "No fill-ups"}</p>
        </div>
        <div className={card}>
          <p className="text-[13px] text-muted-foreground">Average price</p>
          <p className="mt-1 text-[22px] leading-none">{sum?.avgPrice != null ? <><Money amount={sum.avgPrice} currency={cur} /><span className="text-xs text-muted-foreground">/{unitShort(unit)}</span></> : <span className="text-base text-muted-foreground">Not known</span>}</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground" data-testid="fuel-volume">{sum?.volume != null ? `${sum.volume} ${unitShort(unit)} bought` : "No amounts yet"}</p>
        </div>
      </div>

      <Link href="/personal/fuel/new" className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="fuel-add"><Plus className="h-5 w-5" aria-hidden="true" />Add fill-up</Link>

      <section className={card} aria-label="Fill-ups">
        <h2 className="text-base font-extrabold">Fill-ups in {monthLabel(month.slice(0, 7)).split(" ")[0]}</h2>
        {rows && inMonth.length === 0 && <p className="mt-2 text-sm text-muted-foreground" data-testid="fuel-empty">No fill-ups this month. Add one each time you fill the tank.</p>}
        <ul className="mt-1 divide-y">
          {inMonth.map((r) => (
            <li key={r.id}>
              <Link href={`/personal/fuel/${r.id}`} data-testid="fuel-row" className="flex min-h-[60px] items-center gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300" aria-hidden="true"><Fuel className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-extrabold">{formatDate(r.fill_date).replace(/, \d{4}$/, "")}{r.station ? ` · ${r.station}` : ""}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{fillupSub(r)}{r.waiting ? " · waiting to send" : ""}</span>
                </span>
                <span className="text-[17px]"><Money amount={Number(r.amount)} currency={r.currency} /></span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {months.length > 0 && (
        <section className={card} aria-label="Last months">
          <h2 className="mb-3 text-base font-extrabold">Last months</h2>
          <div className="space-y-3">
            {months.map((m) => (
              <button key={m.month} type="button" onClick={() => setMonth(m.month)} aria-pressed={m.month === month} data-testid="fuel-month" className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="mb-1 flex items-baseline justify-between text-sm"><span className={m.month === month ? "font-bold" : ""}>{monthLabel(m.month.slice(0, 7)).split(" ")[0]}</span><span className="text-[15px]"><Money amount={m.total} currency={cur} /></span></span>
                <span className="block h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-orange-600" style={{ width: `${Math.max((m.total / maxMonth) * 100, 2)}%`, opacity: m.month === month ? 1 : 0.6 }} /></span>
              </button>
            ))}
          </div>
          {month !== thisMonth && <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-primary" onClick={() => setMonth(thisMonth)}>Back to this month</button>}
        </section>
      )}
    </div>
  );
}
