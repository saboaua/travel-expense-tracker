"use client";

import { SharedTrips } from "@/components/sharing/SharedTrips";
import { Alert } from "@/components/ui/alert";
import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Plus, Hammer, Plane, ChevronRight, CloudOff } from "lucide-react";
import { KIND_META, type PersonalKind } from "@/lib/personal/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { fetchProjects, projectsKey, type ProjectRow } from "@/lib/offline-personal";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, isRowSave, waitingRowIds } from "@/lib/row-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";


type Row = ProjectRow;
const NEW_DEFAULTS = { personal_expenses: [], destination: null, description: null, start_date: null, end_date: null, budget: null, status: "active" };

export function ProjectsList({ kind }: { kind: PersonalKind }) {
  const meta = KIND_META[kind];
  const Icon = kind === "home_project" ? Hammer : Plane;
  const { data, loading, error, savedAt, userId } = useCachedQuery<ProjectRow[]>((uid) => projectsKey(uid, kind), (s) => fetchProjects(s, kind), [kind]);
  const { items: pending } = useOutbox(userId);
  const rows = useMemo(
    () => applyRows(data ?? [], pending, "personal_projects", (r) => r.kind === kind).map((r) => ({ ...NEW_DEFAULTS, ...r })) as Row[],
    [data, pending, kind]
  );
  const waiting = useMemo(() => waitingRowIds(pending, "personal_projects"), [pending]);
  // A project that has not reached the server has no page of its own yet
  const unsent = useMemo(() => new Set(pending.filter((i) => isRowSave(i) && i.table === "personal_projects" && i.isNew).map((i) => i.id)), [pending]);

  const total = (r: Row) => r.personal_expenses.reduce((s, e) => s + Number(e.amount_usd), 0);
  const active = rows.filter((r) => r.status === "active");
  const done = rows.filter((r) => r.status === "completed");

  const card = (r: Row) => {
    const spent = total(r);
    const pctUsed = r.budget && r.currency === "USD" ? Math.min((spent / Number(r.budget)) * 100, 100) : null;
    const Wrap = ({ children }: { children: React.ReactNode }) => (unsent.has(r.id) ? <div className="block">{children}</div> : <Link href={`${meta.path}/${r.id}`} className="group block">{children}</Link>);
    return (
      <Wrap key={r.id}>
        <div className="h-full rounded-xl border bg-card p-5 shadow-sm transition-shadow group-hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-snug">{r.name}</h3>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          {waiting.has(r.id) && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600"><CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Waiting to sync</p>}
          {(r.destination || r.start_date) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[r.destination, r.start_date ? formatDate(r.start_date) + (r.end_date ? ` – ${formatDate(r.end_date)}` : "") : null].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-4 text-2xl font-bold tracking-tight">{formatCurrency(spent, "USD")}</p>
          <p className="text-xs text-muted-foreground">
            {r.personal_expenses.length} expense{r.personal_expenses.length !== 1 ? "s" : ""}
            {r.budget ? ` · budget ${formatCurrency(Number(r.budget), r.currency)}` : ""}
          </p>
          {pctUsed != null && (
            <div className="mt-3 h-1.5 rounded-full bg-muted">
              <div className={`h-1.5 rounded-full ${pctUsed >= 100 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pctUsed}%` }} />
            </div>
          )}
        </div>
      </Wrap>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-8">
      <Link href="/personal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Personal
      </Link>
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{meta.plural}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {kind === "home_project" ? "Scan tickets and see what each project is costing you" : "Scan receipts and see what a trip cost you"}
          </p>
        </div>
        <Link href={`${meta.path}/new`}>
          <Button className="w-full gap-2 sm:w-auto"><Plus className="h-4 w-4" /> New {meta.noun}</Button>
        </Link>
      </div>

      <OfflineNotice savedAt={savedAt} writable />
      {error && <Alert>{error}</Alert>}

      {!loading && !error && rows.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No {meta.plural.toLowerCase()} yet</p>
            <Link href={`${meta.path}/new`}><Button><Plus className="mr-2 h-4 w-4" /> Create your first {meta.noun}</Button></Link>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Active</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{active.map(card)}</div>
        </section>
      )}
      {kind === "personal_trip" && <SharedTrips kind="personal_trip" />}
      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Completed</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{done.map(card)}</div>
        </section>
      )}
    </div>
  );
}
