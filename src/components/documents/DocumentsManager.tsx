"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, Plus, Trash2, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, todayISO } from "@/lib/utils";
import { DOC_KINDS, kindHasExpiry, kindLabel, passportStatus, type DocKind, type TravelDocument } from "@/lib/documents";
import { DOC_ACCEPT, DOC_BUCKET, removeTravelDocument, saveTravelDocument } from "@/lib/document-upload";

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const LEVEL_STYLE = {
  expired: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
  renew: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-700",
} as const;

/**
 * Lists and uploads documents. With a tripId it shows that trip's documents,
 * without one it shows the general documents (passport, ID, ...).
 */
export function DocumentsManager({ tripId = null, defaultKind = "other", onChange }: { tripId?: string | null; defaultKind?: DocKind; onChange?: (docs: TravelDocument[]) => void }) {
  const [docs, setDocs] = useState<TravelDocument[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<DocKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [country, setCountry] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let q = supabase.from("travel_documents").select("*").order("created_at", { ascending: false });
    q = tripId ? q.eq("trip_id", tripId) : q.is("trip_id", null);
    const { data, error } = await q;
    if (error) {
      setError(/relation|schema cache/i.test(error.message) ? "Documents are not set up yet. Run supabase/migration_documents.sql in Supabase." : error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as TravelDocument[];
    setDocs(list);
    onChange?.(list);
    // Signed links are made up front so they open in one tap (no popup blocking on phones)
    const paths = list.map((d) => d.file_path).filter(Boolean) as string[];
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(DOC_BUCKET).createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setTitle(""); setCountry(""); setExpiry(""); setNotes(""); setFile(null); setKind(defaultKind); setAdding(false); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const label = title.trim() || (kind === "passport" ? "Passport" : file?.name.replace(/\.[^.]+$/, "") || "");
    if (!label) return setError("Give the document a name.");
    if (kind === "passport" && !expiry) return setError("Enter the passport expiry date so we can remind you to renew it.");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      await saveTravelDocument(supabase, user.id, { tripId, kind, title: label, issuing_country: country, expiry_date: kindHasExpiry(kind) ? expiry || null : null, notes, file });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the document.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: TravelDocument) => {
    if (!window.confirm(`Delete "${d.title}"?`)) return;
    try {
      await removeTravelDocument(createClient(), d);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const today = todayISO();

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600" role="alert">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">{tripId ? "No documents for this trip yet. Add your ticket, booking, visa or insurance so it is close at hand." : "No documents yet. Start with your passport."}</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const st = d.kind === "passport" && d.expiry_date ? passportStatus(d.expiry_date, today) : null;
            const url = d.file_path ? urls[d.file_path] : null;
            const isPdf = d.file_path?.toLowerCase().endsWith(".pdf");
            return (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {d.kind === "passport" ? <ShieldCheck className="h-5 w-5" /> : isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {kindLabel(d.kind)}
                    {d.issuing_country ? ` · ${d.issuing_country}` : ""}
                    {d.expiry_date ? ` · expires ${formatDate(d.expiry_date)}` : ""}
                  </p>
                  {d.notes && <p className="truncate text-xs text-muted-foreground">{d.notes}</p>}
                </div>
                {st && <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline ${LEVEL_STYLE[st.level]}`}>{st.level === "ok" ? "Valid" : st.level === "renew" ? "Renew soon" : st.level === "critical" ? "Renew now" : "Expired"}</span>}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border hover:bg-accent" aria-label={`Open ${d.title}`}>
                    <Download className="h-4 w-4" />
                  </a>
                ) : null}
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => remove(d)} aria-label={`Delete ${d.title}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form onSubmit={save} className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
                {DOC_KINDS.filter((k) => tripId ? k.value !== "passport" : true).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "passport" ? "Passport" : "e.g. Flight AUA–MIA"} maxLength={120} />
            </div>
            {kindHasExpiry(kind) && (
              <div>
                <label className="text-xs text-muted-foreground">Expiry date{kind === "passport" ? " (required)" : ""}</label>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
            )}
            {(kind === "passport" || kind === "visa" || kind === "id") && (
              <div>
                <label className="text-xs text-muted-foreground">Issuing country</label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Optional" maxLength={80} />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">File (PDF or photo, up to 10 MB)</label>
            <Input type="file" accept={DOC_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={1000} />
          </div>
          {kind === "passport" && <p className="text-xs text-muted-foreground">Only the expiry date is needed for reminders. Your documents are stored privately and only you can open them.</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save document"}</Button>
            <Button type="button" variant="outline" onClick={reset} disabled={saving}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add document
        </Button>
      )}
    </div>
  );
}
