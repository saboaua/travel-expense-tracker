"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_BASE, PERSONAL_SPEND_COLS_MID, withColumnFallback3 } from "@/lib/columns";
import { AREA_PREFIX, filterHouse, houseSpends, houseTotalUsd, type SpendRow } from "@/lib/personal/quick-spend";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

const pill = (on: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "bg-card hover:bg-accent"}`;

/** Everything spent on the house this year: quick spends categorised House, or attached to a home project. */
export function HouseRepairs() {
  const year = todayISO().slice(0, 4);
  const [rows, setRows] = useState<SpendRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [by, setBy] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await withColumnFallback3((cols) => supabase.from("personal_spends").select(cols).gte("expense_date", `${year}-01-01`).order("expense_date", { ascending: false }).limit(1000), PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_MID, PERSONAL_SPEND_COLS_BASE);
      if (e) { setRows([]); setError(/relation|schema cache/i.test(e.message) ? "Run supabase/migration_quick_spend.sql in Supabase first." : "Could not load your spending. Check your connection."); return; }
      setRows(houseSpends((data ?? []) as unknown as SpendRow[], year));
      const { data: ps } = await supabase.from("personal_projects").select("id, name").eq("kind", "home_project").limit(200);
      setNames(Object.fromEntries(((ps ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])));
    })();
  }, [year]);

  const projectsUsed = useMemo(() => [...new Set((rows ?? []).map((r) => r.project_id).filter((x): x is string => !!x && !!names[x]))], [rows, names]);
  const areasUsed = useMemo(() => [...new Set((rows ?? []).map((r) => r.house_area).filter((x): x is string => !!x))].sort(), [rows]);
  const shown = useMemo(() => filterHouse(rows ?? [], by), [rows, by]);
  const hasLoose = (rows ?? []).some((r) => !r.project_id && !r.house_area);

  const openInvoice = async (path: string) => {
    const { data } = await createClient().storage.from("receipts").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else setError("The invoice photo opens when you are online.");
  };

  return (
    <div className="mx-auto max-w-lg p-4 pb-28 md:p-8">
      <Link href="/personal/spend" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quick spend</Link>
      <h1 className="text-[26px] font-bold leading-tight">House &amp; repairs</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{year} · {rows ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : " "}</p>
      {error && <Alert className="mt-3">{error}</Alert>}

      <div className="mt-4 rounded-2xl border bg-card p-4">
        <p className="text-[28px] font-bold tabular-nums leading-none text-blue-700 dark:text-blue-300" data-testid="house-total">{formatCurrency(houseTotalUsd(shown), "USD")} <span className="text-sm font-semibold text-foreground">spent in {year}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">Shown in USD so different currencies add up.</p>
      </div>

      {(projectsUsed.length > 0 || areasUsed.length > 0 || hasLoose) && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
          <button type="button" aria-pressed={by === "all"} onClick={() => setBy("all")} className={pill(by === "all")}>All</button>
          {projectsUsed.map((id) => <button key={id} type="button" aria-pressed={by === id} onClick={() => setBy(id)} className={pill(by === id)}>{names[id]}</button>)}
          {areasUsed.map((a) => <button key={a} type="button" aria-pressed={by === `${AREA_PREFIX}${a}`} onClick={() => setBy(`${AREA_PREFIX}${a}`)} className={pill(by === `${AREA_PREFIX}${a}`)}>{a}</button>)}
          {hasLoose && <button type="button" aria-pressed={by === "none"} onClick={() => setBy("none")} className={pill(by === "none")}>No project</button>}
        </div>
      )}

      <div className="mt-3 rounded-2xl border bg-card px-4" data-testid="house-list">
        {rows === null ? <p className="py-4 text-sm text-muted-foreground">&nbsp;</p> : shown.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing yet. In Quick spend, choose the category House.</p>
        ) : (
          <ul className="divide-y">
            {shown.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2" data-testid="house-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.merchant || r.category}</span>
                  <span className="block text-[13px] text-muted-foreground">{formatDate(r.expense_date)} · {r.project_id && names[r.project_id] ? names[r.project_id] : r.house_area ? r.house_area : "No project or area"}</span>
                </span>
                {r.receipt_path && (
                  <button type="button" onClick={() => openInvoice(r.receipt_path!)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-blue-50 px-2.5 text-[13px] font-semibold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-blue-950 dark:text-blue-200"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />Invoice</button>
                )}
                <span className="text-[15px] font-bold tabular-nums">{formatCurrency(Number(r.amount), r.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
