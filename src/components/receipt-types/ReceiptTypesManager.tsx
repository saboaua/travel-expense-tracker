"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Tag } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import { OTHER_COLORS, useOtherColor } from "@/lib/use-other-color";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Alert } from "@/components/ui/alert";
import { useReceiptTypes } from "@/lib/use-receipt-types";
import { saveReceiptType } from "@/lib/receipt-types-data";
import { spentByTypeId } from "@/lib/personal/budget";
import { fetchMonthInputs } from "@/lib/personal/budget-data";
import { fetchBudgets } from "@/lib/personal/budget-data";
import { pickBudget } from "@/lib/personal/budget";
import { todayISO } from "@/lib/utils";
import { TypeIcon } from "@/components/receipt-types/TypeIcon";
import { NewTypeForm } from "@/components/receipt-types/NewTypeForm";
import type { ReceiptType } from "@/lib/receipt-types";

/** Personal > Receipt types: your own kinds of receipt, a switch for each to get its own line in the monthly budget, and what each added this month. */
export function ReceiptTypesManager() {
  const { types, missing, loading, reload } = useReceiptTypes();
  const other = useOtherColor();
  const [form, setForm] = useState<"new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [cur, setCur] = useState("USD");
  const month = `${todayISO().slice(0, 7)}-01`;

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const [{ rows }, inputs] = await Promise.all([fetchBudgets(sb), fetchMonthInputs(sb, month)]);
      const c = pickBudget(rows, month)?.currency ?? "AWG";
      if (alive) { setCur(c); setSpent(spentByTypeId(inputs, c)); }
    })().catch(() => {});
    return () => { alive = false; };
  }, [month, types.length]);

  const sorted = useMemo(() => [...types].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [types]);

  const toggle = async (t: ReceiptType) => {
    setError(null);
    const r = await saveReceiptType(createClient(), { name: t.name, icon: t.icon, color: t.color, show_in_budget: !t.show_in_budget, monthly_limit: t.monthly_limit }, t.id);
    if (r.error) setError(r.error); else reload();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8" data-testid="receipt-types">
      <BackLink href="/personal">Personal</BackLink>
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl"><IconTile tone="projects" color={other.color} className="h-11 w-11"><Tag className="h-[22px] w-[22px]" /></IconTile>Other</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your own kinds of receipt. Every one counts in your budget. Switch on the ones that should show as their own line on the dashboard; the rest are added up in one line called Other.</p>
      </div>
      <Card data-testid="other-color"><CardContent className="p-4">
        <p className="mb-2 text-[13px] font-bold">Colour of this row</p>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colour of the Other row">
          {OTHER_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={other.color === c} aria-label={c} onClick={() => other.save(c)} data-testid={`other-color-${c.slice(1)}`}
              className="h-[30px] w-[30px] rounded-full" style={{ background: c, boxShadow: other.color === c ? `0 0 0 3px var(--card, #fff), 0 0 0 5px ${c}` : undefined }} />
          ))}
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">Shown on the Other row in Personal. Only you see your choice. Each type below keeps its own colour, set when you edit the type.</p>
        {other.error && <Alert className="mt-2">{other.error}</Alert>}
      </CardContent></Card>
      {missing && <Alert>Receipt types are not set up yet. Run supabase/migration_receipt_types.sql in Supabase.</Alert>}
      {error && <Alert>{error}</Alert>}
      {form ? (
        <Card><CardContent className="p-4">
          <p className="mb-3 text-base font-bold">New type</p>
          <NewTypeForm existing={types} onCancel={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
        </CardContent></Card>
      ) : (
        <>
          {!loading && !missing && sorted.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No types yet. Create one for receipts like food, a massage, a clinic or the vet.</CardContent></Card>}
          {sorted.length > 0 && (
            <Card><CardContent className="divide-y p-0 px-4">
              {sorted.map((t) => (
                <div key={t.id} data-testid={`type-row-${t.id}`} className="flex items-center gap-3 py-3">
                  <Link href={`/personal/types/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <TypeIcon icon={t.icon} color={t.color} className="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{t.name}</span>
                      <span className="block text-xs text-muted-foreground"><Money amount={spent[t.id] ?? 0} currency={cur} /> this month</span>
                    </span>
                  </Link>
                  <span className="flex flex-col items-end gap-0.5">
                    <input type="checkbox" role="switch" aria-label={`Show ${t.name} on the dashboard`} checked={t.show_in_budget} onChange={() => toggle(t)} className="h-6 w-11 accent-primary" />
                    <span className="text-[11px] text-muted-foreground">On dashboard</span>
                  </span>
                  <Link href={`/personal/types/${t.id}`} aria-label={`Open ${t.name}`} className="flex h-10 w-6 items-center justify-center text-muted-foreground"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
                </div>
              ))}
            </CardContent></Card>
          )}
          {!missing && <button type="button" data-testid="add-type" onClick={() => setForm("new")} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-base font-semibold text-primary hover:bg-primary/5"><Plus className="h-5 w-5" aria-hidden="true" />New type</button>}
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">Tap a type to see its receipts by month. Edit or delete a type from its page; its receipts go back to Groceries.</p>
        </>
      )}
    </div>
  );
}
