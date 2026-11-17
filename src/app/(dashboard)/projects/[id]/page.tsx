"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Camera, CheckCircle2, Crown, Download, FileSpreadsheet, ImageIcon, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_COLS, RECEIPT_COLS, clientLines, projectTotals, receiptUsd, type BizProject, type BizReceipt } from "@/lib/business-projects";
import { featureLocked, projectsStatus } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { formatDate, todayISO } from "@/lib/utils";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lim = useLimits();
  const [p, setP] = useState<BizProject | null>(null);
  const [receipts, setReceipts] = useState<BizReceipt[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [pr, rc] = await Promise.all([
      supabase.from("business_projects").select(PROJECT_COLS).eq("id", id).maybeSingle(),
      supabase.from("business_project_receipts").select(RECEIPT_COLS).eq("project_id", id).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (!pr.data) return setState("missing");
    setP(pr.data as unknown as BizProject);
    setReceipts((rc.data ?? []) as unknown as BizReceipt[]);
    setState("ready");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <div className="p-4 md:p-8 text-sm text-muted-foreground">Loading…</div>;
  if (state === "missing" || !p) return <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8"><BackLink href="/projects">Projects</BackLink><Alert>This project was not found.</Alert></div>;

  const budget = p.budget != null ? Number(p.budget) : null;
  const t = projectTotals(receipts, budget);
  const info = clientLines(p);

  const setStatus = async (status: "active" | "done") => {
    setError(null);
    const supabase = createClient();
    if (status === "active" && lim) {
      const { count } = await supabase.from("business_projects").select("id", { count: "exact", head: true }).eq("status", "active");
      const c = projectsStatus(lim.limits, lim.who, count ?? 0, todayISO());
      if (c.full) return setError(`Your ${lim.who.pro ? "Pro" : "Free"} plan holds ${c.limit} active projects.${lim.who.pro ? "" : " Finish another or get Pro to reopen this one."}`);
    }
    const { error: e } = await supabase.from("business_projects").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (e) return setError("Could not save. Check your connection and try again.");
    void load();
  };
  const removeProject = async () => {
    if (!window.confirm("Delete this project and all its receipts?")) return;
    const supabase = createClient();
    const paths = receipts.map((r) => r.receipt_path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("receipts").remove(paths).catch(() => {});
    const { error: e } = await supabase.from("business_projects").delete().eq("id", id);
    if (e) return setError("Could not delete. Check your connection and try again.");
    router.push("/projects");
    router.refresh();
  };
  const removeReceipt = async (r: BizReceipt) => {
    if (!window.confirm("Delete this receipt?")) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("business_project_receipts").delete().eq("id", r.id);
    if (e) return setError("Could not delete. Check your connection and try again.");
    if (r.receipt_path) await supabase.storage.from("receipts").remove([r.receipt_path]).catch(() => {});
    void load();
  };
  const viewPhoto = async (r: BizReceipt) => {
    if (!r.receipt_path) return;
    const { data } = await createClient().storage.from("receipts").createSignedUrl(r.receipt_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const locked = !!lim && featureLocked(lim.limits, lim.who, "trip_reports", todayISO());
  const exportLink = (format: "pdf" | "excel", label: string, Icon: typeof Download) => !locked
    ? <a key={format} href={`/api/export/report?scope=bproject&id=${id}&format=${format}`} download className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-bold hover:bg-accent" data-testid={`project-${format}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</a>
    : <Link key={format} href="/personal/pro" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-bold hover:bg-accent" data-testid={`project-${format}`}><Crown className="h-4 w-4 text-amber-600" aria-hidden="true" />{label}</Link>;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28 md:p-8">
      <BackLink href="/projects">Projects</BackLink>
      <PageHeader title={p.name} description={info[0] ? info[0].replace("Client: ", "") + (p.contact_name ? ` · ${p.contact_name}` : "") : undefined} actions={<Link href={`/projects/${id}/edit`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-bold hover:bg-accent"><Pencil className="h-4 w-4" aria-hidden="true" />Edit</Link>} />
      {error && <Alert>{error}</Alert>}

      <Card><CardContent className="py-4" data-testid="project-summary">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[13px] text-muted-foreground">Spent so far</p><Money amount={t.total} currency="USD" className="text-3xl" over={t.budgetLeft != null && t.budgetLeft < 0} /></div>
          <p className="text-right text-[13px] text-muted-foreground">{t.count} receipt{t.count === 1 ? "" : "s"}{budget != null && <><br />of <Money amount={budget} currency="USD" className="text-[13px]" /> budget</>}</p>
        </div>
        {t.pct != null && <div className="mt-3 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${t.pct >= 100 ? "bg-red-500" : t.pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, t.pct)}%` }} /></div>}
        {t.budgetLeft != null && <p className={`mt-2 text-sm font-semibold ${t.budgetLeft < 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{t.budgetLeft < 0 ? "Over budget by " : "Budget left: "}{Math.abs(t.budgetLeft).toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>}
        {t.uncounted > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t.uncounted} receipt{t.uncounted === 1 ? " has" : "s have"} no USD value and {t.uncounted === 1 ? "is" : "are"} not in the total.</p>}
      </CardContent></Card>

      {p.status === "active" ? (
        <Link href={`/projects/${id}/add`} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground" data-testid="add-project-receipt"><Camera className="h-5 w-5" aria-hidden="true" />Scan receipt</Link>
      ) : <Alert variant="info">This project is finished. Reopen it to add receipts.</Alert>}

      {t.byCategory.length > 0 && (
        <>
          <p className="px-0.5 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">By category</p>
          <Card><CardContent className="py-1">{t.byCategory.map(([c, v], i) => <div key={c} className={`flex items-center justify-between py-2.5 text-sm ${i ? "border-t" : ""}`}><span>{c}</span><Money amount={v} currency="USD" /></div>)}</CardContent></Card>
        </>
      )}

      <p className="px-0.5 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Receipts</p>
      {receipts.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No receipts yet. Scan the first one.</CardContent></Card> : (
        <Card><CardContent className="py-1">
          {receipts.map((r, i) => {
            const usd = receiptUsd(r);
            return (
              <div key={r.id} data-testid="project-receipt" className={`flex items-center gap-3 py-3 ${i ? "border-t" : ""}`}>
                <button type="button" onClick={() => viewPhoto(r)} disabled={!r.receipt_path} aria-label={r.receipt_path ? "View the receipt photo" : "No photo"} className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImageIcon className="h-5 w-5" aria-hidden="true" /></button>
                <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{r.merchant || "Receipt"}</p><p className="truncate text-[13px] text-muted-foreground">{formatDate(r.expense_date)} · {r.category || "Other"}</p></div>
                <div className="text-right"><Money amount={Number(r.amount)} currency={r.currency || "USD"} className="text-[15px]" />{r.currency && r.currency !== "USD" && usd != null && <p className="text-xs text-muted-foreground">≈ ${usd.toFixed(2)}</p>}</div>
                <button type="button" onClick={() => removeReceipt(r)} aria-label="Delete this receipt" className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            );
          })}
        </CardContent></Card>
      )}

      <p className="px-0.5 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Report</p>
      <div className="flex gap-3">{exportLink("pdf", "PDF", Download)}{exportLink("excel", "Excel", FileSpreadsheet)}</div>
      <p className="text-xs text-muted-foreground">Client details, totals by category and every receipt. {locked ? "Excel and PDF reports are part of Pro." : ""}</p>

      <div className="flex flex-col gap-2 pt-2">
        {p.status === "active"
          ? <Button variant="outline" className="min-h-12 gap-2" onClick={() => setStatus("done")} data-testid="project-finish"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Mark as finished</Button>
          : <Button variant="outline" className="min-h-12 gap-2" onClick={() => setStatus("active")} data-testid="project-reopen"><RotateCcw className="h-4 w-4" aria-hidden="true" />Reopen project</Button>}
        <Button variant="ghost" className="min-h-12 gap-2 text-red-700 dark:text-red-300" onClick={removeProject}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete project</Button>
      </div>
    </div>
  );
}
