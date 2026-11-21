"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Alert } from "@/components/ui/alert";
import { useReceiptTypes } from "@/lib/use-receipt-types";
import { deleteReceiptType, saveReceiptType } from "@/lib/receipt-types-data";
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
  const [form, setForm] = useState<"new" | ReceiptType | null>(null);
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
  const remove = async (t: ReceiptType) => {
    if (!window.confirm(`Delete "${t.name}"? Its receipts are kept and move back to Groceries.`)) return;
    const e = await deleteReceiptType(createClient(), t.id);
    if (e) setError(e); else reload();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-8" data-testid="receipt-types">
      <BackLink href="/personal">Personal</BackLink>
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Receipt types</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your own kinds of receipt besides Groceries and Shopping. Every type counts in your monthly budget. Switch on the ones that should get their own line; the rest are added up in Other types.</p>
      </div>
      {missing && <Alert>Receipt types are not set up yet. Run supabase/migration_receipt_types.sql in Supabase.</Alert>}
      {error && <Alert>{error}</Alert>}
      {form ? (
        <Card><CardContent className="p-4">
          <p className="mb-3 text-base font-bold">{form === "new" ? "New type" : `Edit ${form.name}`}</p>
          <NewTypeForm existing={types} editing={form === "new" ? null : form} onCancel={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
        </CardContent></Card>
      ) : (
        <>
          {!loading && !missing && sorted.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No types yet. Create one for receipts like a massage, a clinic or the vet.</CardContent></Card>}
          <div className="space-y-2">
            {sorted.map((t) => (
              <Card key={t.id} data-testid={`type-row-${t.id}`}><CardContent className="flex items-center gap-3 p-3">
                <TypeIcon icon={t.icon} color={t.color} className="h-10 w-10" />
                <Link href={`/personal/types/${t.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">This month <Money amount={spent[t.id] ?? 0} currency={cur} /></span>
                </Link>
                <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">In budget</span>
                  <input type="checkbox" role="switch" aria-label={`Show ${t.name} in my monthly budget`} checked={t.show_in_budget} onChange={() => toggle(t)} className="h-6 w-11 accent-primary" />
                </label>
                <button type="button" onClick={() => setForm(t)} className="min-h-11 px-2 text-sm font-semibold text-primary">Edit</button>
                <button type="button" onClick={() => remove(t)} aria-label={`Delete ${t.name}`} className="flex h-11 w-9 items-center justify-center text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </CardContent></Card>
            ))}
          </div>
          {!missing && <button type="button" data-testid="add-type" onClick={() => setForm("new")} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-base font-semibold text-primary hover:bg-primary/5"><Plus className="h-5 w-5" aria-hidden="true" />New type</button>}
        </>
      )}
    </div>
  );
}
