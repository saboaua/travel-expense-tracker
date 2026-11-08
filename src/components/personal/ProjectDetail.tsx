"use client";

import { BackLink } from "@/components/ui/page-header";
import { ShareWith } from "@/components/sharing/ShareWith";
import { useConfirm } from "@/components/ui/confirm";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Receipt, CheckCircle2, RotateCcw, CloudOff } from "lucide-react";
import { KIND_META, type PersonalExpense, type PersonalKind } from "@/lib/personal/constants";
import { useUsdRate } from "@/lib/personal/use-rate";
import { Bars } from "@/components/personal/Bars";
import { daysBetween, formatCurrency, formatDate } from "@/lib/utils";
import { fetchProjectBundle, projectKey, type ProjectBundle } from "@/lib/offline-personal";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, deleteRow, isRowSave, makeRowApi, saveRow, waitingRowIds } from "@/lib/row-outbox";
import { browserOutbox } from "@/lib/outbox";
import { OfflineNotice } from "@/components/OfflineNotice";

export function ProjectDetail({ kind, id }: { kind: PersonalKind; id: string }) {
  const meta = KIND_META[kind];
  const router = useRouter();
  const confirm = useConfirm();
  const supabase = createClient();
  const { data: bundle, loading, error: loadError, savedAt, userId } = useCachedQuery<ProjectBundle>((uid) => projectKey(uid, id), (sb) => fetchProjectBundle(sb, id), [id]);
  const { items: pending } = useOutbox(userId);
  const [error, setError] = useState<string | null>(null);
  // Waiting changes show as if they were already saved
  const project = useMemo(() => (bundle ? (applyRows([bundle.project], pending, "personal_projects")[0] ?? null) : null), [bundle, pending]);
  const expenses = useMemo(
    () => applyRows(bundle?.expenses ?? [], pending, "personal_expenses", (r) => r.project_id === id).map((x) => ({ ...x, amount: Number(x.amount), amount_usd: Number(x.amount_usd), currency: x.currency ?? "USD", category: x.category ?? "Other", receipt_path: x.receipt_path ?? null })) as PersonalExpense[],
    [bundle, pending, id]
  );
  const waiting = useMemo(() => waitingRowIds(pending, "personal_expenses"), [pending]);
  const unsent = useMemo(() => new Set(pending.filter((i) => isRowSave(i) && i.table === "personal_expenses" && i.isNew).map((i) => i.id)), [pending]);

  const { rate: budgetRate } = useUsdRate(project?.currency || "USD");

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (loadError || !project) return <div className="p-8 text-sm text-red-600">{loadError || "Not found"}</div>;

  const totalUsd = expenses.reduce((s, e) => s + e.amount_usd, 0);

  // Spent in the budget's own currency (converted through USD for other currencies)
  const r = Number(budgetRate);
  const spentInBudget =
    project.currency === "USD"
      ? totalUsd
      : r > 0
        ? expenses.reduce((s, e) => s + (e.currency === project.currency ? e.amount : e.amount_usd / r), 0)
        : null;
  const budget = project.budget != null ? Number(project.budget) : null;
  const pctUsed = budget && spentInBudget != null ? (spentInBudget / budget) * 100 : null;

  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((m, e) => ({ ...m, [e.category]: (m[e.category] || 0) + e.amount_usd }), {})
  )
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const days = project.start_date && project.end_date ? Math.max(daysBetween(project.start_date, project.end_date) + 1, 1) : null;
  const biggest = expenses.length ? [...expenses].sort((a, b) => b.amount_usd - a.amount_usd)[0] : null;

  const toggleStatus = async () => {
    const next = project.status === "active" ? "completed" : "active";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to change this.");
      await saveRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "personal_projects", id, row: { status: next },
        waiting: pending.find((i) => i.id === id) ?? null, label: project.name, summary: `${meta.label} · status`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status.");
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete project?", message: `Delete "${project.name}" and all its expenses? This cannot be undone.`, destructive: true }))) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete this.");
      await deleteRow({
        api: makeRowApi(supabase), store: browserOutbox, userId: session.user.id, table: "personal_projects", id, label: project.name, summary: `${meta.label} · delete`,
        sweep: [{ table: "personal_expenses", fk: "project_id", column: "receipt_path", bucket: "receipts" }],
        waiting: pending.find((i) => i.id === id) ?? null,
      });
    } catch (err) {
      return setError(err instanceof Error ? err.message : "Could not delete.");
    }
    router.push(meta.path);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8 pb-28 space-y-6">
      <BackLink href={meta.path}>{meta.plural}</BackLink>
      <OfflineNotice savedAt={savedAt} writable />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">{project.name}</h1>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${project.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
              {project.status === "active" ? "Active" : "Completed"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[project.destination, project.start_date ? formatDate(project.start_date) + (project.end_date ? ` – ${formatDate(project.end_date)}` : "") : null].filter(Boolean).join(" · ")}
          </p>
          {project.description && <p className="mt-2 text-sm">{project.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${meta.path}/${id}/expense`}><Button className="gap-2"><Plus className="h-4 w-4" /> Add expense</Button></Link>
          <Button variant="outline" className="gap-2" onClick={toggleStatus}>
            {project.status === "active" ? <><CheckCircle2 className="h-4 w-4" /> Complete</> : <><RotateCcw className="h-4 w-4" /> Reopen</>}
          </Button>
          <Link href={`${meta.path}/${id}/edit`}><Button variant="outline" size="icon" aria-label="Edit"><Pencil className="h-4 w-4" /></Button></Link>
          <Button variant="outline" size="icon" aria-label="Delete" className="text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {kind === "personal_trip" && <ShareWith kind="personal_trip" itemId={id} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Total spent</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{formatCurrency(totalUsd, "USD")}</p><p className="text-xs text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p></CardContent></Card>
        {budget != null ? (
          <Card>
            <CardHeader className="pb-2"><CardDescription>Budget</CardDescription></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatCurrency(budget, project.currency)}</p>
              {pctUsed != null && spentInBudget != null ? (
                <>
                  <div className="mt-2 h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${pctUsed >= 100 ? "bg-red-500" : pctUsed >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} /></div>
                  <p className={`mt-1 text-xs ${pctUsed >= 100 ? "text-red-600" : "text-muted-foreground"}`}>
                    {pctUsed.toFixed(0)}% used · {spentInBudget <= budget ? `${formatCurrency(budget - spentInBudget, project.currency)} left` : `${formatCurrency(spentInBudget - budget, project.currency)} over`}
                  </p>
                </>
              ) : <p className="text-xs text-muted-foreground">Loading exchange rate…</p>}
            </CardContent>
          </Card>
        ) : (
          <Card><CardHeader className="pb-2"><CardDescription>Budget</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">No budget set. <Link href={`${meta.path}/${id}/edit`} className="underline">Add one</Link></p></CardContent></Card>
        )}
        {kind === "personal_trip" ? (
          <Card><CardHeader className="pb-2"><CardDescription>Average per day</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{days ? formatCurrency(totalUsd / days, "USD") : "—"}</p><p className="text-xs text-muted-foreground">{days ? `${days} day${days !== 1 ? "s" : ""}` : "Set trip dates to see this"}</p></CardContent></Card>
        ) : (
          <Card><CardHeader className="pb-2"><CardDescription>Biggest expense</CardDescription></CardHeader><CardContent><p className="text-3xl font-bold">{biggest ? formatCurrency(biggest.amount_usd, "USD") : "—"}</p><p className="truncate text-xs text-muted-foreground">{biggest ? biggest.merchant || biggest.category : "No expenses yet"}</p></CardContent></Card>
        )}
      </div>

      {byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Spending by category</CardTitle></CardHeader>
          <CardContent><Bars rows={byCategory} format={(n) => formatCurrency(n, "USD")} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Expenses</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {expenses.length === 0 ? (
            <div className="py-10 text-center">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">No expenses yet. Scan your first receipt.</p>
              <Link href={`${meta.path}/${id}/expense`}><Button className="gap-2"><Plus className="h-4 w-4" /> Add expense</Button></Link>
            </div>
          ) : (
            expenses.map((e) => {
              const Row = ({ children }: { children: React.ReactNode }) => unsent.has(e.id)
                ? <div className="flex items-center justify-between gap-3 rounded-xl border p-3">{children}</div>
                : <Link href={`${meta.path}/${id}/expense/${e.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-accent">{children}</Link>;
              return (
              <Row key={e.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.merchant || e.category}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.expense_date)} · {e.category}{e.receipt_path ? " · receipt" : ""}{waiting.has(e.id) && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600"><CloudOff className="inline h-3 w-3" aria-hidden="true" /> Waiting to sync</span>}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{formatCurrency(e.amount_usd, "USD")}</p>
                  {e.currency !== "USD" && <p className="text-xs text-muted-foreground">{formatCurrency(e.amount, e.currency)}</p>}
                </div>
              </Row>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
