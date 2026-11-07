"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp, Eye, Pencil, Plus, Trash2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { HelpBody } from "@/components/help/HelpBody";
import { HELP_TOPIC_COLS } from "@/lib/columns";
import { DEFAULT_HELP_CATEGORY, HELP_LIMITS, groupByCategory, slugifyTopic, validateHelpDraft, type HelpTopic } from "@/lib/help";
import { cn } from "@/lib/utils";

type Form = { id: string | null; title: string; category: string; summary: string; body: string; sort_order: string; published: boolean };
const EMPTY: Form = { id: null, title: "", category: DEFAULT_HELP_CATEGORY, summary: "", body: "", sort_order: "100", published: true };

const label = "mb-1 block text-sm font-medium";
const field = "flex w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm";

export default function AdminHelpPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [topics, setTopics] = useState<HelpTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("help_topics").select(HELP_TOPIC_COLS).order("sort_order").order("title").limit(500);
    if (error) {
      setError(/relation|does not exist|schema cache/i.test(error.message) ? "The help table was not found. Run supabase/migration_help.sql in the Supabase SQL Editor." : error.message);
    } else {
      setError(null);
      const rows = (data as HelpTopic[]) || [];
      setTopics(rows);
      // "Edit this topic" on a help page links here with ?edit=<slug>
      const want = new URLSearchParams(window.location.search).get("edit");
      const row = want ? rows.find((r) => r.slug === want) : null;
      if (row) setForm({ id: row.id, title: row.title, category: row.category, summary: row.summary, body: row.body, sort_order: String(row.sort_order), published: row.published });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => [...new Set(topics.map((t) => t.category))], [topics]);
  const groups = useMemo(() => groupByCategory(topics), [topics]);

  function edit(t: HelpTopic) {
    setNotice(null); setError(null); setPreview(false);
    setForm({ id: t.id, title: t.title, category: t.category, summary: t.summary, body: t.body, sort_order: String(t.sort_order), published: t.published });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!form) return;
    setError(null); setNotice(null);
    const v = validateHelpDraft(form);
    if (!v.ok) { setError(v.error); return; }
    setSaving(true);
    let err: { code?: string; message: string } | null = null;
    if (form.id) {
      ({ error: err } = await supabase.from("help_topics").update(v.value).eq("id", form.id));
    } else {
      const base = slugifyTopic(v.value.title);
      const { data: { user } } = await supabase.auth.getUser();
      for (let n = 1; n <= 5; n++) {
        const slug = n === 1 ? base : `${base.slice(0, 76)}-${n}`;
        ({ error: err } = await supabase.from("help_topics").insert({ ...v.value, slug, created_by: user?.id ?? null }));
        if (!err || err.code !== "23505") break; // only a clash with another topic's address is retried
      }
    }
    setSaving(false);
    if (err) {
      setError(err.code === "42501" ? "Your role is not allowed to change help topics." : err.message);
      return;
    }
    setNotice(form.id ? "Topic saved." : "Topic added.");
    setForm(null);
    await load();
  }

  async function remove(t: HelpTopic) {
    if (!(await confirm({ title: "Delete this topic?", message: `“${t.title}” will be removed for everyone.`, confirmLabel: "Delete", destructive: true }))) return;
    const { error } = await supabase.from("help_topics").delete().eq("id", t.id);
    if (error) setError(error.message);
    else { setNotice("Topic deleted."); if (form?.id === t.id) setForm(null); await load(); }
  }

  async function togglePublished(t: HelpTopic) {
    const { error } = await supabase.from("help_topics").update({ published: !t.published }).eq("id", t.id);
    if (error) setError(error.message);
    else await load();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl"><CircleHelp className="h-7 w-7" aria-hidden="true" /> Help topics</h1>
          <p className="mt-1 text-muted-foreground">Write the guides every user sees under Help in the menu.</p>
        </div>
        {!form && <Button type="button" className="gap-2" onClick={() => { setNotice(null); setError(null); setPreview(false); setForm({ ...EMPTY }); }}><Plus className="h-4 w-4" /> New topic</Button>}
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {form && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edit topic" : "New topic"}</CardTitle>
            <CardDescription>Users see the title, short description and text. Keep steps short and start each with an action.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="help-title" className={label}>Title</label>
              <Input id="help-title" value={form.title} maxLength={HELP_LIMITS.title} onChange={(e) => set("title", e.target.value)} placeholder="How to add a loyalty card" className="h-11 text-base md:h-10 md:text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div>
                <label htmlFor="help-category" className={label}>Category</label>
                <Input id="help-category" list="help-categories" value={form.category} maxLength={HELP_LIMITS.category} onChange={(e) => set("category", e.target.value)} className="h-11 text-base md:h-10 md:text-sm" />
                <datalist id="help-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label htmlFor="help-order" className={label}>Order</label>
                <Input id="help-order" type="number" inputMode="numeric" min={0} max={9999} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} className="h-11 text-base md:h-10 md:text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="help-summary" className={label}>Short description <span className="font-normal text-muted-foreground">({form.summary.length}/{HELP_LIMITS.summary})</span></label>
              <Input id="help-summary" value={form.summary} maxLength={HELP_LIMITS.summary} onChange={(e) => set("summary", e.target.value)} placeholder="One sentence shown under the title" className="h-11 text-base md:h-10 md:text-sm" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="help-body" className="text-sm font-medium">Text <span className="font-normal text-muted-foreground">({form.body.length}/{HELP_LIMITS.body})</span></label>
                <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-primary hover:underline lg:hidden"><Eye className="h-4 w-4" /> {preview ? "Edit" : "Preview"}</button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <textarea id="help-body" rows={14} value={form.body} maxLength={HELP_LIMITS.body} onChange={(e) => set("body", e.target.value)} className={cn(field, "font-mono leading-relaxed", preview && "hidden lg:flex")} placeholder={"## A heading\n1. First step\n2. Second step\n\n> Tip: a helpful note"} />
                <div className={cn("min-w-0 rounded-lg border bg-background p-4", !preview && "hidden lg:block")} aria-label="Preview">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
                  <HelpBody body={form.body} />
                </div>
              </div>
              <details className="mt-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">How to format</summary>
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  <li>## Heading</li><li>1. Numbered step</li><li>- Bullet point</li><li>&gt; Tip: highlighted note</li><li>**bold text**</li>
                  <li className="font-sans">Leave a blank line between paragraphs. No pictures or links.</li>
                </ul>
              </details>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="h-5 w-5 rounded border-input accent-[hsl(var(--primary))]" />
              <span><span className="font-medium">Published</span> <span className="text-muted-foreground">— untick to keep it as a draft only you can see</span></span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => { setForm(null); setError(null); }} disabled={saving}>Cancel</Button>
              <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Add topic"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" aria-busy="true" />
      ) : topics.length === 0 && !error ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No topics yet. Add the first one.</CardContent></Card>
      ) : (
        groups.map((g) => (
          <section key={g.category} aria-label={g.category} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.category}</h2>
            <ul className="overflow-hidden rounded-xl border bg-card">
              {g.topics.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Order {t.sort_order}</p>
                  </div>
                  <button type="button" onClick={() => togglePublished(t)} className={cn("min-h-9 rounded-full px-3 text-xs font-semibold", t.published ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200")} aria-label={t.published ? `Published. Tap to make “${t.title}” a draft` : `Draft. Tap to publish “${t.title}”`}>
                    {t.published ? "Published" : "Draft"}
                  </button>
                  <div className="flex items-center gap-1">
                    <Link href={`/help/${t.slug}`} aria-label={`View ${t.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><ExternalLink className="h-4 w-4" /></Link>
                    <button type="button" onClick={() => edit(t)} aria-label={`Edit ${t.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(t)} aria-label={`Delete ${t.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
