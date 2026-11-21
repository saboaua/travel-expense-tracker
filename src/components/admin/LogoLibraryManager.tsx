"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { LogoPicker } from "@/components/logos/LogoPicker";
import { SubLogo } from "@/components/logos/SubLogo";
import { norm, parseKeywords, type LibraryLogo } from "@/lib/logo-match";

type Draft = { id: string | null; name: string; keywords: string; logo: string | null; website: string };
const blank: Draft = { id: null, name: "", keywords: "", logo: null, website: "" };
const field = "flex flex-col gap-1.5 text-sm font-medium";

/** Admin > Logo library: the company logos people can pick when they add a subscription. */
export function LogoLibraryManager() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [rows, setRows] = useState<LibraryLogo[] | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("logo_library").select("id, name, keywords, logo").order("name");
    if (e) return setError(/does not exist|schema cache/i.test(e.message) ? "The logo library is not set up yet. Run migration_logo_library.sql in the Supabase SQL Editor." : "Could not load the library. Try again.");
    setError("");
    setRows((data ?? []) as LibraryLogo[]);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = norm(query);
    return (rows ?? []).filter((r) => !q || norm([r.name, ...r.keywords].join(" ")).includes(q));
  }, [rows, query]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setError("Enter the company name.");
    if (!draft.logo) return setError("Add a logo: upload one or find it from the website.");
    setSaving(true); setError("");
    const row = { name, keywords: parseKeywords(draft.keywords), logo: draft.logo };
    const { error: e } = draft.id ? await supabase.from("logo_library").update(row).eq("id", draft.id) : await supabase.from("logo_library").insert(row);
    setSaving(false);
    if (e) return setError(/duplicate|unique/i.test(e.message) ? "There is already a logo with that name." : /row-level|policy/i.test(e.message) ? "Only an admin can change the logo library." : "Could not save. Try again.");
    setDraft(null);
    await load();
  };

  const remove = async (r: LibraryLogo) => {
    if (!(await confirm({ title: `Remove the ${r.name} logo?`, message: "Subscriptions that already use it keep it. New ones will not be offered it.", confirmLabel: "Remove", destructive: true }))) return;
    const { error: e } = await supabase.from("logo_library").delete().eq("id", r.id);
    if (e) setError("Could not remove it. Try again.");
    await load();
  };

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search logos" aria-label="Search logos" className="pl-9" />
        </div>
        <Button onClick={() => { setError(""); setDraft({ ...blank }); }} className="shrink-0"><Plus className="h-4 w-4" /> Add a logo</Button>
      </div>

      {!rows && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && (shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? "No logos yet. Add the companies people subscribe to most." : "No logo matches that search."}</p>
      ) : (
        <Card className="divide-y">
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3" data-testid="logo-row">
              <SubLogo logo={r.logo} name={r.name} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.keywords.length ? `Also matches: ${r.keywords.join(", ")}` : "Matches its name only"}</p>
              </div>
              <button type="button" onClick={() => { setError(""); setDraft({ id: r.id, name: r.name, keywords: r.keywords.join(", "), logo: r.logo, website: "" }); }} aria-label={`Edit ${r.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => void remove(r)} aria-label={`Remove ${r.name}`} className="flex h-11 w-11 items-center justify-center rounded-lg text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </Card>
      ))}

      {draft && (
        <Card className="space-y-3 p-4" data-testid="logo-form">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{draft.id ? "Edit logo" : "Add a logo"}</h2>
            <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent"><X className="h-5 w-5" /></button>
          </div>
          <label className={field}>Company<Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="Disney+" /></label>
          <label className={field}>Also matches
            <Input value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="disney plus, disney premium" />
            <span className="text-xs font-normal text-muted-foreground">Separate with commas. A subscription named like any of these gets this logo offered.</span>
          </label>
          <LogoPicker name={draft.name} logo={draft.logo} onLogo={(l) => setDraft((d) => (d ? { ...d, logo: l } : d))} website={draft.website} onWebsite={(w) => setDraft((d) => (d ? { ...d, website: w } : d))} />
          <Button onClick={save} disabled={saving} className="h-12 w-full text-base">{saving ? "Saving…" : "Save to library"}</Button>
        </Card>
      )}
    </div>
  );
}
