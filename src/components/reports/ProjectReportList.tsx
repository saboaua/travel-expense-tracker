import Link from "next/link";
import { Briefcase, Crown, Download, FileSpreadsheet } from "lucide-react";
import { Money } from "@/components/ui/money";

export type ProjectReportRow = { id: string; name: string; client: string | null; status: "active" | "done"; total: number; count: number; budget: number | null };

/** The business projects under the trip reports: open one, or download its Excel or PDF. */
export function ProjectReportList({ projects, locked }: { projects: ProjectReportRow[]; locked: boolean }) {
  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-bold hover:bg-accent";
  return (
    <ul className="divide-y" data-testid="project-reports">
      {projects.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
          <Link href={`/projects/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Briefcase className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block truncate text-[15px] font-bold">{p.name}</span><span className="block truncate text-[13px] text-muted-foreground">{[p.client, `${p.count} receipt${p.count === 1 ? "" : "s"}`, p.status === "done" ? "Done" : null].filter(Boolean).join(" · ")}</span></span>
          </Link>
          <Money amount={p.total} currency="USD" className="text-[15px]" over={p.budget != null && p.total > p.budget} />
          <span className="flex gap-2">
            {(["pdf", "excel"] as const).map((f) => !locked
              ? <a key={f} href={`/api/export/report?scope=bproject&id=${p.id}&format=${f}`} download className={btn} aria-label={`${f === "pdf" ? "PDF" : "Excel"} for ${p.name}`}>{f === "pdf" ? <Download className="h-4 w-4" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}{f === "pdf" ? "PDF" : "Excel"}</a>
              : <Link key={f} href="/personal/pro" className={btn} aria-label={`${f === "pdf" ? "PDF" : "Excel"} for ${p.name}: Pro`}><Crown className="h-4 w-4 text-amber-600" aria-hidden="true" />{f === "pdf" ? "PDF" : "Excel"}</Link>)}
          </span>
        </li>
      ))}
    </ul>
  );
}
