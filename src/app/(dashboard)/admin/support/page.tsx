"use client";

import { BackLink, PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Check, Trash2, RotateCcw, RefreshCw, Sparkles } from "lucide-react";
import { SUPPORT_REQUEST_AI_COLS, SUPPORT_REQUEST_COLS, withColumnFallback } from "@/lib/columns";
import { CATEGORY_LABEL, PRIORITY_LABEL, type SupportCategory, type SupportPriority } from "@/lib/support-ai";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

type SupportRequest = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: "new" | "resolved";
  created_at: string;
  ai_status?: "done" | "failed" | null;
  ai_summary?: string | null;
  ai_category?: SupportCategory | null;
  ai_priority?: SupportPriority | null;
  ai_steps?: string[] | null;
};

const fmt = formatDateTime;

export default function AdminSupportPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "resolved" | "all">("new");
  const [summarizing, setSummarizing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await withColumnFallback(
      (cols) => supabase.from("support_requests").select(cols).order("created_at", { ascending: false }).limit(200),
      SUPPORT_REQUEST_AI_COLS,
      SUPPORT_REQUEST_COLS,
    );
    if (error) {
      setError(
        /relation|does not exist|schema cache/i.test(error.message)
          ? "Support table not found. Run supabase/migration_login_support.sql in the Supabase SQL Editor."
          : error.message
      );
    } else {
      setError(null);
      setRows((data as unknown as SupportRequest[]) || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const summarize = async (id: string) => {
    setSummarizing(id); setError(null);
    const res = await fetch("/api/admin/support/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const json = await res.json().catch(() => ({}));
    setSummarizing(null);
    if (!res.ok) return setError(json.error || "Could not make the summary.");
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...(json.ai ?? { ai_status: "failed" }) } : r)));
  };

  const setStatus = async (id: string, status: "new" | "resolved") => {
    const { error } = await supabase.from("support_requests").update({ status }).eq("id", id);
    if (error) setError(error.message);
    else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const confirm = useConfirm();
  const remove = async (id: string) => {
    if (!(await confirm({ title: "Delete message?", message: "Delete this message permanently?", destructive: true }))) return;
    const { error } = await supabase.from("support_requests").delete().eq("id", id);
    if (error) setError(error.message);
    else setRows((rs) => rs.filter((r) => r.id !== id));
  };

  const newCount = rows.filter((r) => r.status === "new").length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className={`${PAGE_WIDTH.wide} p-4 md:p-8 pb-24 space-y-6`}>
      <BackLink href="/admin/settings">Global Settings</BackLink>
      <PageHeader title="Support Requests" description={<>Messages sent from the Contact Support form on the login screen.</>} />

      {error && <Alert>{error}</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>{newCount} new</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {(["new", "resolved", "all"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                {f}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-3 xl:space-y-0">
          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing here.</p>
          ) : (
            shown.map((r) => (
              <div key={r.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.subject || "(no subject)"}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.name} · {r.email} · {fmt(r.created_at)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.status === "new" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{r.message}</p>
                {summarizing === r.id ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40" data-testid="ai-summarizing"><p className="text-xs font-extrabold tracking-wide text-indigo-700 dark:text-indigo-300">AI SUMMARY</p><p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">Summarizing…</p></div>
                ) : r.ai_status === "done" && r.ai_summary ? (
                  <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40" data-testid="ai-summary">
                    <div className="flex items-center gap-2"><p className="text-xs font-extrabold tracking-wide text-indigo-700 dark:text-indigo-300">AI SUMMARY</p><span className="flex-1" />
                      {r.ai_category && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11.5px] font-extrabold text-rose-800 dark:bg-rose-950 dark:text-rose-200">{CATEGORY_LABEL[r.ai_category] ?? r.ai_category}</span>}
                      {r.ai_priority && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11.5px] font-extrabold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{PRIORITY_LABEL[r.ai_priority] ?? r.ai_priority}</span>}
                    </div>
                    <p className="text-sm font-semibold leading-snug">{r.ai_summary}</p>
                    {(r.ai_steps ?? []).length > 0 && (<><p className="text-xs font-extrabold tracking-wide text-indigo-700 dark:text-indigo-300">NEXT STEPS</p><ol className="list-decimal space-y-0.5 pl-5 text-sm">{(r.ai_steps ?? []).map((st, i) => <li key={i}>{st}</li>)}</ol></>)}
                    <p className="text-[11.5px] text-indigo-600 dark:text-indigo-400">Written by AI from the message. Check it before you act.</p>
                  </div>
                ) : r.ai_status === "failed" ? (
                  <div className="space-y-2 rounded-xl border bg-muted/50 p-3" data-testid="ai-failed">
                    <p className="text-xs font-extrabold tracking-wide text-indigo-700 dark:text-indigo-300">AI SUMMARY</p>
                    <p className="text-sm text-muted-foreground">The summary could not be made. The request is saved and nothing is lost.</p>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => summarize(r.id)} data-testid="ai-retry"><RotateCcw className="h-4 w-4" />Try again</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => summarize(r.id)} data-testid="ai-make"><Sparkles className="h-4 w-4" />Summarize with AI</Button>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject || "Your support request"}`)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent"
                  >
                    <Mail className="h-4 w-4" /> Reply
                  </a>
                  {r.status === "new" ? (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setStatus(r.id, "resolved")}>
                      <Check className="h-4 w-4" /> Mark resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setStatus(r.id, "new")}>
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
