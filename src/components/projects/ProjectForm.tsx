"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_COLS, parseProject, type BizProject } from "@/lib/business-projects";
import { projectsStatus } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { todayISO } from "@/lib/utils";

const MISSING = "Business projects are not set up yet. Run supabase/migration_projects.sql.";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-semibold">{label}</label>{children}</div>;
}

/** The one form for a new project and for editing one: the project, then the client. */
export function ProjectForm({ id }: { id?: string }) {
  const router = useRouter();
  const lim = useLimits();
  const [v, setV] = useState({ name: "", budget: "", start_date: todayISO(), end_date: "", client_name: "", contact_name: "", contact_email: "", contact_phone: "", reference: "", notes: "" });
  const [loaded, setLoaded] = useState(!id);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      if (id) {
        const { data } = await supabase.from("business_projects").select(PROJECT_COLS).eq("id", id).maybeSingle();
        const p = data as unknown as BizProject | null;
        if (p) setV({ name: p.name, budget: p.budget != null ? String(p.budget) : "", start_date: p.start_date ?? "", end_date: p.end_date ?? "", client_name: p.client_name ?? "", contact_name: p.contact_name ?? "", contact_email: p.contact_email ?? "", contact_phone: p.contact_phone ?? "", reference: p.reference ?? "", notes: p.notes ?? "" });
        setLoaded(true);
      } else {
        const { count } = await supabase.from("business_projects").select("id", { count: "exact", head: true }).eq("status", "active");
        setActive(count ?? 0);
      }
    })();
  }, [id]);

  const cap = !id && lim && active != null ? projectsStatus(lim.limits, lim.who, active, todayISO()) : null;

  const save = async () => {
    const parsed = parseProject(v);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      if (!id) {
        const { count } = await supabase.from("business_projects").select("id", { count: "exact", head: true }).eq("status", "active");
        const c = lim ? projectsStatus(lim.limits, lim.who, count ?? 0, todayISO()) : null;
        if (c?.full) throw new Error(`Your ${lim?.who.pro ? "Pro" : "Free"} plan holds ${c.limit} active projects.${lim?.who.pro ? "" : " Finish one or get Pro to start another."}`);
        const { data, error: ins } = await supabase.from("business_projects").insert({ ...parsed.value, status: "active", user_id: uid }).select("id").single();
        if (ins) throw new Error(/business_projects/.test(ins.message) ? MISSING : "Could not save. Check your connection and try again.");
        router.push(`/projects/${data.id}`);
      } else {
        const { error: up } = await supabase.from("business_projects").update({ ...parsed.value, updated_at: new Date().toISOString() }).eq("id", id);
        if (up) throw new Error("Could not save. Check your connection and try again.");
        router.push(`/projects/${id}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (cap?.full) {
    return (
      <Card><CardContent className="space-y-3 py-5" data-testid="project-limit">
        <p className="text-base font-bold">You have {cap.count} active projects</p>
        <p className="text-sm text-muted-foreground">Your {lim?.who.pro ? "Pro" : "Free"} plan includes {cap.limit}. Finish one to start another{lim?.who.pro ? "." : ", or get Pro for more."} Your projects stay open and editable.</p>
        {!lim?.who.pro && <Link href="/personal/pro" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground" data-testid="project-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>}
      </CardContent></Card>
    );
  }
  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <p className="px-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Project</p>
      <Card><CardContent className="space-y-4 py-4">
        <Field id="pj-name" label="Project name"><Input id="pj-name" value={v.name} maxLength={120} onChange={set("name")} placeholder="Harbour rebrand" data-testid="project-name" /></Field>
        <Field id="pj-budget" label="Budget (optional, in USD)"><Input id="pj-budget" inputMode="decimal" value={v.budget} onChange={set("budget")} placeholder="4000" data-testid="project-budget" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="pj-start" label="Start"><Input id="pj-start" type="date" value={v.start_date} onChange={set("start_date")} className="min-w-0" /></Field>
          <Field id="pj-end" label="End (optional)"><Input id="pj-end" type="date" value={v.end_date} onChange={set("end_date")} className="min-w-0" /></Field>
        </div>
      </CardContent></Card>
      <p className="px-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Client</p>
      <Card><CardContent className="space-y-4 py-4">
        <Field id="pj-client" label="Client or company"><Input id="pj-client" value={v.client_name} maxLength={120} onChange={set("client_name")} placeholder="Blue Wave Co." data-testid="project-client" /></Field>
        <Field id="pj-contact" label="Contact name"><Input id="pj-contact" value={v.contact_name} maxLength={120} onChange={set("contact_name")} /></Field>
        <Field id="pj-email" label="Email"><Input id="pj-email" type="email" value={v.contact_email} maxLength={160} onChange={set("contact_email")} /></Field>
        <Field id="pj-phone" label="Phone or address (optional)"><Input id="pj-phone" value={v.contact_phone} maxLength={160} onChange={set("contact_phone")} /></Field>
        <Field id="pj-ref" label="Your reference or PO number (optional)"><Input id="pj-ref" value={v.reference} maxLength={80} onChange={set("reference")} /></Field>
        <Field id="pj-notes" label="Notes (optional)"><textarea id="pj-notes" value={v.notes} maxLength={1000} rows={2} onChange={set("notes")} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px]" /></Field>
      </CardContent></Card>
      <p className="text-xs leading-relaxed text-muted-foreground">Client details appear at the top of the project report. Only you see them, unless you send the report to someone.</p>
      <Button onClick={save} disabled={busy} className="min-h-12 w-full gap-2 text-[15px]" data-testid="project-save"><Check className="h-5 w-5" aria-hidden="true" />{busy ? "Saving…" : id ? "Save changes" : "Create project"}</Button>
    </div>
  );
}
