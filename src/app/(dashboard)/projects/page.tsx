import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, ChevronRight, Crown, Lock, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { BusinessHeader, BusinessTabs } from "@/components/layout/BusinessTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Money } from "@/components/ui/money";
import { Alert } from "@/components/ui/alert";
import { loadLimits, whoIs } from "@/lib/limits-server";
import { projectsStatus } from "@/lib/limits";
import { PROJECT_COLS, activeCount, projectTotals, type BizProject } from "@/lib/business-projects";
import { todayISO } from "@/lib/utils";

type Rec = { project_id: string; amount: number | string; currency: string | null; amount_usd: number | string | null; category: string | null };

function Row({ p, rec, first }: { p: BizProject; rec: Rec[]; first: boolean }) {
  const t = projectTotals(rec, p.budget != null ? Number(p.budget) : null);
  return (
    <Link href={`/projects/${p.id}`} data-testid="project-row" className={`block py-3 hover:bg-accent/40 ${first ? "" : "border-t"}`}>
      <div className="flex items-center gap-3">
        <IconTile tone="projects" className="h-11 w-11"><Briefcase className="h-5 w-5" /></IconTile>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{p.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{[p.client_name, `${t.count} receipt${t.count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <Money amount={t.total} currency="USD" className="text-[15px]" over={t.budgetLeft != null && t.budgetLeft < 0} />
          {p.status === "done" && <p className="text-xs font-bold text-muted-foreground">Done</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {t.pct != null && p.status === "active" && (
        <div className="mt-2 pl-14">
          <div className="h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${t.pct >= 100 ? "bg-red-500" : t.pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, t.pct)}%` }} /></div>
          <p className="mt-1 text-xs text-muted-foreground">{t.pct}% of {Number(p.budget).toLocaleString("en-US")} budget</p>
        </div>
      )}
    </Link>
  );
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.from("business_projects").select(PROJECT_COLS).eq("user_id", user.id).order("created_at", { ascending: false });
  const missing = !!error;
  const projects = (data ?? []) as unknown as BizProject[];
  const { data: rows } = projects.length ? await supabase.from("business_project_receipts").select("project_id, amount, currency, amount_usd, category").eq("user_id", user.id).limit(20000) : { data: [] };
  const byProject = new Map<string, Rec[]>();
  for (const r of (rows ?? []) as Rec[]) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r]);

  const [limits, who] = await Promise.all([loadLimits(supabase), whoIs(supabase, user.id)]);
  const cap = projectsStatus(limits, who, activeCount(projects), todayISO());
  const active = projects.filter((p) => p.status === "active"), done = projects.filter((p) => p.status === "done");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-28 md:p-8">
      <BusinessHeader />
      <BusinessTabs
        title="Projects"
        description="Keep each client's receipts together and report on them"
        actions={cap.full ? undefined : <Link href="/projects/new"><Button className="w-full gap-2 sm:w-auto" data-testid="new-project"><Plus className="h-4 w-4" />New project</Button></Link>}
      />

      {missing && <Alert>Business projects are not set up yet. Run supabase/migration_projects.sql in the Supabase SQL Editor.</Alert>}

      {cap.limit != null && !missing && (
        <p className="text-sm font-semibold text-muted-foreground" data-testid="project-meter">{cap.count} of {cap.limit} {who.pro ? "" : "free "}active projects</p>
      )}
      {cap.full && (
        <Card><CardContent className="space-y-3 py-4" data-testid="project-limit">
          <div className="flex items-center gap-3"><IconTile tone="badges" className="h-11 w-11"><Lock className="h-5 w-5" /></IconTile><div><p className="text-[15px] font-bold">You have {cap.count} active projects</p><p className="text-[13px] text-muted-foreground">{who.pro ? `Your Pro plan includes ${cap.limit}. Finish one to start another.` : `Free includes ${cap.limit}. Finish one or get Pro for more.`}</p></div></div>
          {!who.pro && <Link href="/personal/pro" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground" data-testid="project-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>}
        </CardContent></Card>
      )}

      {!missing && projects.length === 0 ? (
        <Card className="mt-4"><CardContent className="py-14 text-center">
          <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <p className="mb-1 font-bold">No projects yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Add a client, scan receipts into the project, then send a report of what you spent.</p>
          <Link href="/projects/new"><Button><Plus className="mr-2 h-4 w-4" />Create your first project</Button></Link>
        </CardContent></Card>
      ) : (
        <>
          {active.length > 0 && <Card><CardContent className="py-1">{active.map((p, i) => <Row key={p.id} p={p} rec={byProject.get(p.id) ?? []} first={i === 0} />)}</CardContent></Card>}
          {done.length > 0 && (
            <>
              <p className="px-0.5 pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Finished</p>
              <Card><CardContent className="py-1">{done.map((p, i) => <Row key={p.id} p={p} rec={byProject.get(p.id) ?? []} first={i === 0} />)}</CardContent></Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
