"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fileKind } from "@/lib/documents";
import { Camera, Crop, Download, Eye, EyeOff, FileText, Loader2, Pencil, Plus, Trash2, ShieldCheck, Sparkles, X, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, todayISO } from "@/lib/utils";
import { DOC_KINDS, kindHasExpiry, kindLabel, maskNumber, passportStatus, type DocKind, type TravelDocument } from "@/lib/documents";
import { compressDocImage, DOC_ACCEPT, DOC_BUCKET, DOC_QUALITY, formatBytes, isCroppable, removeTravelDocument, saveTravelDocument, updateTravelDocument, type DocQuality } from "@/lib/document-upload";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { extractDocumentFields, scanFailureMessage } from "@/lib/document-extract";

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const LEVEL_STYLE = {
  expired: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
  renew: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-700",
} as const;


/** Full-screen preview of an uploaded document (photo or PDF). */
function DocumentViewer({ title, url, path, onClose }: { title: string; url: string; path: string; onClose: () => void }) {
  const kind = fileKind(path);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/80" role="dialog" aria-modal="true" aria-label={`Viewing ${title}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate font-medium">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-white/10" aria-label="Open in a new tab or download">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Open / download</span>
          </a>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10" aria-label="Close viewer" autoFocus>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {kind === "pdf" ? (
          <iframe src={url} title={title} className="h-full w-full max-w-4xl rounded-lg bg-white" />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <div className="rounded-xl bg-card p-6 text-center text-sm text-card-foreground">
            <p className="mb-3">This file type cannot be previewed here (for example HEIC photos from some phones).</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Open or download it</a>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [number, setNumber] = useState("");
  const [editing, setEditing] = useState<TravelDocument | null>(null);
  const [viewing, setViewing] = useState<{ title: string; url: string; path: string } | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Photo pipeline: original pick -> crop -> compress. `prepared` files are uploaded as is.
  const [original, setOriginal] = useState<File | null>(null);
  const [cropped, setCropped] = useState<File | null>(null);
  const [cropping, setCropping] = useState<{ file: File; thenScan: boolean } | null>(null);
  const [quality, setQuality] = useState<DocQuality>("standard");
  const [sizes, setSizes] = useState<{ before: number; after: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const preparedFile = useRef<File | null>(null);

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

  const reset = () => { setEditing(null); setNumber(""); setTitle(""); setCountry(""); setExpiry(""); setNotes(""); setFile(null); setOriginal(null); setCropped(null); setCropping(null); setSizes(null); setQuality("standard"); setKind(defaultKind); setAdding(false); setScanNote(null); };

  const startEdit = (d: TravelDocument) => {
    setError(null);
    setScanNote(null);
    setEditing(d);
    setKind(d.kind);
    setTitle(d.title);
    setNumber(d.document_number || "");
    setCountry(d.issuing_country || "");
    setExpiry(d.expiry_date || "");
    setNotes(d.notes || "");
    setFile(null);
    setOriginal(null);
    setCropped(null);
    setSizes(null);
    setAdding(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const toggleReveal = (id: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
      const fields = { kind, title: label, document_number: number, issuing_country: country, expiry_date: kindHasExpiry(kind) ? expiry || null : null, notes, file, prepared: !!cropped && file === preparedFile.current };
      if (editing) await updateTravelDocument(supabase, user.id, editing, fields);
      else await saveTravelDocument(supabase, user.id, { tripId, ...fields });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the document.");
    } finally {
      setSaving(false);
    }
  };

  /** Compresses the cropped photo with the chosen quality and shows the size saving. */
  const prepare = async (src: File, q: DocQuality, before: number) => {
    const out = await compressDocImage(src, q).catch(() => src);
    preparedFile.current = out;
    setFile(out);
    setSizes({ before, after: out.size });
    return out;
  };

  /** A photo was chosen or taken: crop it first when the browser can, otherwise use it as is. */
  const pick = (f: File, thenScan: boolean) => {
    setScanNote(null);
    setOriginal(f);
    setCropped(null);
    setSizes(null);
    preparedFile.current = null;
    if (isCroppable(f)) {
      setCropping({ file: f, thenScan });
    } else {
      setFile(f);
      if (thenScan && f.type.startsWith("image/")) scan(f);
    }
  };

  const onCropped = async (c: File) => {
    const job = cropping;
    setCropping(null);
    setCropped(c);
    const out = await prepare(c, quality, original?.size ?? c.size);
    if (job?.thenScan) scan(out);
  };

  const changeQuality = async (q: DocQuality) => {
    setQuality(q);
    if (cropped) await prepare(cropped, q, original?.size ?? cropped.size);
  };

  /** Reads the photo and fills the form. Existing typed values are only replaced when the scan found something. */
  const scan = async (f: File) => {
    setFile(f);
    setScanNote(null);
    setError(null);
    setScanning(true);
    try {
      const { fields, source, reason } = await extractDocumentFields(f);
      if (source === "none") {
        setScanNote(scanFailureMessage(reason));
        return;
      }
      // Passports belong to the general list, not to a trip
      if (fields.kind && !(tripId && fields.kind === "passport")) setKind(fields.kind);
      const k = fields.kind && !(tripId && fields.kind === "passport") ? fields.kind : kind;
      if (fields.document_number) setNumber(fields.document_number);
      if (fields.issuing_country) setCountry(fields.issuing_country);
      if (fields.expiry_date) setExpiry(fields.expiry_date);
      if (!title.trim()) {
        const label = DOC_KINDS.find((d) => d.value === k)?.label.split(" / ")[0] ?? "Document";
        setTitle(fields.holder_name ? `${label} \u2013 ${fields.holder_name}` : label);
      }
      setScanNote(
        source === "ai"
          ? "Details filled from your photo. Please check them, especially the expiry date, before saving."
          : "Read from the passport's machine-readable lines. Please check the details before saving."
      );
    } finally {
      setScanning(false);
    }
  };

  const onCamera = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) pick(f, true);
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
      {cropping && <ReceiptCropper file={cropping.file} title="Crop to the part you need" hint="Keep the whole page in view, including the two lines of < < < at the bottom of a passport." initialCrop={{ x: 2, y: 2, w: 96, h: 96 }} onDone={onCropped} onCancel={() => { setCropping(null); if (!cropped) { setOriginal(null); } }} />}
      {viewing && <DocumentViewer {...viewing} onClose={() => setViewing(null)} />}
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
                  {d.document_number && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>No. <span className="font-mono">{revealed.has(d.id) ? d.document_number : maskNumber(d.document_number)}</span></span>
                      <button type="button" onClick={() => toggleReveal(d.id)} className="rounded p-0.5 hover:bg-accent" aria-label={revealed.has(d.id) ? "Hide number" : "Show number"}>
                        {revealed.has(d.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </p>
                  )}
                  {d.notes && <p className="truncate text-xs text-muted-foreground">{d.notes}</p>}
                </div>
                {st && <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline ${LEVEL_STYLE[st.level]}`}>{st.level === "ok" ? "Valid" : st.level === "renew" ? "Renew soon" : st.level === "critical" ? "Renew now" : "Expired"}</span>}
                {d.file_path && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled={!url}
                    onClick={() => url && d.file_path && setViewing({ title: d.title, url, path: d.file_path })}
                    aria-label={`View ${d.title}`}
                    title={url ? "View" : "Preparing preview\u2026"}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => startEdit(d)} aria-label={`Edit ${d.title}`} title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => remove(d)} aria-label={`Delete ${d.title}`} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form ref={formRef} onSubmit={save} className="space-y-3 rounded-xl border bg-muted/30 p-4">
          {editing && <p className="text-sm font-semibold">Edit document</p>}
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
            <button
              type="button"
              disabled={scanning}
              onClick={() => camera.current?.click()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70 sm:w-auto sm:px-5"
            >
              {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              {scanning ? "Reading…" : "Scan with camera"}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">Take a photo of your passport page (or any travel document) and we fill in the details for you.</p>
            {scanNote && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground" role="status">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {scanNote}
              </p>
            )}
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCamera} />
          </div>
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
            <div>
              <label className="text-xs text-muted-foreground">Document number</label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" maxLength={40} autoComplete="off" className="font-mono" />
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
            <label className="text-xs text-muted-foreground">{editing?.file_path ? "Replace file (optional, the current file is kept otherwise)" : "File (PDF or photo, up to 10 MB)"}</label>
            <Input
              type="file"
              accept={DOC_ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (!f) { setFile(null); setOriginal(null); setCropped(null); setSizes(null); return; }
                if (f.type.startsWith("image/")) pick(f, false);
                else { setOriginal(null); setCropped(null); setSizes(null); preparedFile.current = null; setFile(f); setScanNote(null); }
              }}
            />
            {file && file.type.startsWith("image/") && !scanning && (
              <button type="button" onClick={() => scan(file)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Sparkles className="h-3.5 w-3.5" /> Fill the fields from this photo
              </button>
            )}
            {file && <p className="mt-1 truncate text-xs text-muted-foreground">Attached: {file.name}{sizes ? ` \u00b7 ${formatBytes(sizes.before)} \u2192 ${formatBytes(sizes.after)}` : ` \u00b7 ${formatBytes(file.size)}`}</p>}
            {original && cropped && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCropping({ file: original, thenScan: false })} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
                  <Crop className="h-3.5 w-3.5" /> Crop again
                </button>
                <label className="sr-only" htmlFor="doc-quality">Photo quality</label>
                <select id="doc-quality" className="h-8 rounded-md border bg-background px-2 text-xs" value={quality} onChange={(e) => changeQuality(e.target.value as DocQuality)} title={DOC_QUALITY[quality].hint}>
                  {(Object.keys(DOC_QUALITY) as DocQuality[]).map((q) => <option key={q} value={q}>{DOC_QUALITY[q].label}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={1000} />
          </div>
          {kind === "passport" && <p className="text-xs text-muted-foreground">Only the expiry date is needed for reminders. The number is optional and shown hidden by default. Your documents are stored privately and only you can open them. When AI reading is on, the photo is sent to the AI service to read it.</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : editing ? "Save changes" : "Save document"}</Button>
            <Button type="button" variant="outline" onClick={reset} disabled={saving}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => { setEditing(null); setAdding(true); }}>
          <Plus className="h-4 w-4" /> Add document
        </Button>
      )}
    </div>
  );
}
