"use client";

import { CreditWhileTraveling } from "@/components/personal/CreditWhileTraveling";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, FileSpreadsheet, FileText, Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import dynamic from "next/dynamic";
import { WhereItGoes } from "@/components/personal/WhereItGoes";
import { PersonalTabs } from "@/components/layout/PersonalTabs";
import { loadDashboardData } from "@/lib/personal/dashboard-data";
import type { DashboardProject, DashboardRow } from "@/lib/personal/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReportLogoSwitch } from "@/components/reports/ReportLogoSwitch";
import { createClient } from "@/lib/supabase/client";
import { usePro } from "@/lib/use-pro";
import { cn, todayISO } from "@/lib/utils";

type Scope = "month" | "groceries" | "project";
const SCOPES: { id: Scope; label: string; includes: string }[] = [
  { id: "month", label: "Month overview", includes: "Every expense of the month: groceries, shopping, utilities, quick spends, house and repairs, projects, savings and fixed costs. Each has its date, name, category and amount in AWG, then totals by area." },
  { id: "groceries", label: "Groceries", includes: "Every item from your receipts in the month with its store, category and amount in AWG, then totals by category." },
  { id: "project", label: "Project", includes: "One project: its name, every expense and the totals." },
];
const PersonalDashboard = dynamic(() => import("@/components/personal/PersonalDashboard"), { ssr: false, loading: () => <p className="py-6 text-center text-sm text-muted-foreground">Loading your spending…</p> });
const pill = "inline-flex min-h-[38px] items-center rounded-xl border px-3 text-[13.5px] font-bold";

export default function ReportsPage() {
  const pro = usePro();
  const [scope, setScope] = useState<Scope>("month");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [project, setProject] = useState("");
  const [withLogo, setWithLogo] = useState(true);

  const [data, setData] = useState<{ rows: DashboardRow[]; projects: DashboardProject[] } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid = session?.user.id;
      const d = uid ? await loadDashboardData(supabase, uid).catch(() => null) : null;
      if (live) setData(d);
    }, () => { if (live) setData(null); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    createClient().from("personal_projects").select("id, name").eq("kind", "home_project").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { const list = (data ?? []) as { id: string; name: string }[]; setProjects(list); setProject((p) => p || list[0]?.id || ""); }, () => {});
  }, []);

  const ready = pro === true && (scope === "project" ? !!project : /^\d{4}-\d{2}$/.test(month));
  const qs = (format: string) => `scope=${scope}&format=${format}&logo=${withLogo ? 1 : 0}${scope === "project" ? `&id=${project}` : `&month=${month}`}`;
  const current = SCOPES.find((s) => s.id === scope)!;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
      <PageHeader title="Personal reports" description="Your spending and your exports." />
      <PersonalTabs />
      <h2 className="sr-only">Reports</h2>

      {data === undefined ? <p className="py-6 text-center text-sm text-muted-foreground">Loading your spending…</p> : data === null ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Your spending could not be loaded. Check your connection and try again.</p> : (
        <PersonalDashboard rows={data.rows} projects={data.projects} today={todayISO()} pro={pro === true} />
      )}

      {pro === true && <WhereItGoes />}

      <CreditWhileTraveling year={todayISO().slice(0, 4)} />

      {pro === true && projects.length > 0 && (
        <section aria-labelledby="rep-projects" className="space-y-2" data-testid="report-projects">
          <h2 id="rep-projects" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
          <Card><CardContent className="divide-y py-1">
            {projects.map((p) => (
              <div key={p.id} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</span>
                <a href={`/api/export/report?scope=project&format=excel&logo=${withLogo ? 1 : 0}&id=${p.id}`} download className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3.5 text-sm font-bold hover:bg-accent" aria-label={`Excel for ${p.name}`} data-testid="project-excel"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Excel</a>
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}

      <section aria-labelledby="rep-export" className="space-y-4">
        <div className="flex items-center gap-2"><h2 id="rep-export" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</h2><span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Crown className="h-3 w-3" aria-hidden="true" />Pro</span></div>

      <Card><CardContent className="space-y-3 py-4">
        <p className="text-[13px] font-semibold text-muted-foreground" id="report-what">What to report</p>
        <div role="radiogroup" aria-labelledby="report-what" className="flex flex-wrap gap-2">
          {SCOPES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={scope === s.id} onClick={() => setScope(s.id)} className={cn(pill, scope === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card")} data-testid={`scope-${s.id}`}>{s.label}</button>)}
        </div>
      </CardContent></Card>

      {scope === "project" ? (
        <div className="space-y-1.5">
          <label htmlFor="report-project" className="text-sm font-medium">Project</label>
          {projects.length === 0 ? <p className="text-sm text-muted-foreground">You have no projects yet.</p> : (
            <select id="report-project" value={project} onChange={(e) => setProject(e.target.value)} className="h-12 w-full rounded-xl border bg-background px-3 text-base">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="report-month" className="text-sm font-medium">Month</label>
          <Input id="report-month" type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="h-12" />
        </div>
      )}

      <Card><CardContent className="space-y-3 py-4">
        <ReportLogoSwitch on={withLogo} onChange={setWithLogo} />
        <p className="rounded-xl bg-muted/40 p-3 text-[12.5px] leading-snug text-muted-foreground" data-testid="report-includes"><b className="text-foreground">Includes: </b>{current.includes}</p>
      </CardContent></Card>

      <div className="flex gap-3">
        {([["excel", "Excel", FileSpreadsheet], ["pdf", "PDF", FileText]] as const).map(([f, label, Icon]) => ready ? (
          <a key={f} href={`/api/export/report?${qs(f)}`} download className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-bold hover:bg-accent" data-testid={`report-${f}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</a>
        ) : (
          <span key={f} aria-disabled="true" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-muted text-sm font-bold text-muted-foreground" data-testid={`report-${f}-off`}><Icon className="h-4 w-4" aria-hidden="true" />{label}{pro === false && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Lock className="h-3 w-3" aria-hidden="true" />Pro</span>}</span>
        ))}
      </div>
      {pro === false && <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-snug text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="report-pro-note"><Crown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><b>Reports are a Pro feature.</b> <Link href="/personal/pro" className="font-bold underline" data-testid="get-pro-link">See how to get Pro</Link>.</span></p>}
      </section>
    </div>
  );
}
