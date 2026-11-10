"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CloudOff, Crop, Loader2, Plus, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayISO } from "@/lib/utils";
import { DOC_KINDS, DOC_SCOPES, docScope, kindHasExpiry, type DocKind, type DocScope, type TravelDocument } from "@/lib/documents";
import { DocumentList } from "@/components/documents/DocumentList";
import { takeQuickScan } from "@/lib/quick-scan";
import { compressDocImage, DOC_ACCEPT, DOC_BUCKET, DOC_QUALITY, formatBytes, isCroppable, type DocQuality } from "@/lib/document-upload";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { ReceiptCropper } from "@/components/ReceiptCropper";
import { extractDocumentFields, scanFailureMessage } from "@/lib/document-extract";
import { cacheFile, documentsKey, fetchDocuments, savedFileUrls } from "@/lib/offline-data";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { applyDocumentOutbox, deleteDocument, isDocumentSave, makeDocumentApi, saveDocument } from "@/lib/document-outbox";
import { browserOutbox, SYNCED_EVENT } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { OfflineNotice } from "@/components/OfflineNotice";

/**
 * Lists and uploads documents. With a tripId it shows that trip's documents,
 * without one it shows the general documents (passport, ID, ...).
 */
export function DocumentsManager({ tripId = null, defaultKind = "other", onChange }: { tripId?: string | null; defaultKind?: DocKind; onChange?: (docs: TravelDocument[]) => void }) {
  const [docs, setDocs] = useState<TravelDocument[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
  const [showOn, setShowOn] = useState<DocScope>("both");
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
  const handedOver = useRef(false);

  const savedUrls = useRef<string[]>([]);
  const { items: waiting } = useOutbox(userId);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const visibleDocs = useMemo(() => applyDocumentOutbox(docs, waiting, tripId), [docs, waiting, tripId]);
  const waitingIds = useMemo(() => new Set(waiting.filter((i) => i.kind.startsWith("document.")).map((i) => i.id)), [waiting]);
  const waitingHere = visibleDocs.filter((d) => waitingIds.has(d.id)).length;

  const load = useCallback(async () => {
    const supabase = createClient();
    // The session is read from the phone, so this also works with no connection
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id;
    setUserId(userId ?? null);
    const res = userId
      ? await loadWithCache(browserKv, documentsKey(userId, tripId), () => fetchDocuments(supabase, tripId))
      : ({ ok: false, error: new Error("Sign in again to see your documents.") } as const);
    if (!res.ok) {
      const message = (res.error as { message?: string } | null)?.message || "Could not load your documents.";
      setError(/relation|schema cache/i.test(message) ? "Documents are not set up yet. Run supabase/migration_documents.sql in Supabase." : message);
      setLoading(false);
      return;
    }
    const list = res.data;
    setSavedAt(res.fromCache ? res.savedAt : null);
    setDocs(list);
    const paths = list.map((d) => d.file_path).filter(Boolean) as string[];
    if (res.fromCache) {
      // No connection: open the files that are saved on the phone
      const local = await savedFileUrls(DOC_BUCKET, paths);
      savedUrls.current.push(...Object.values(local));
      setUrls(local);
    } else if (paths.length) {
      // Signed links are made up front so they open in one tap (no popup blocking on phones)
      const { data: signed } = await supabase.storage.from(DOC_BUCKET).createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
      // Keep a copy of each file for the next time there is no connection
      (async () => { for (const p of paths.slice(0, 25)) await cacheFile(supabase, DOC_BUCKET, p); })();
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => () => { savedUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading) onChangeRef.current?.(visibleDocs); }, [visibleDocs, loading]);

  // Something waiting on the phone was sent: reload the list
  useEffect(() => {
    window.addEventListener(SYNCED_EVENT, load);
    return () => window.removeEventListener(SYNCED_EVENT, load);
  }, [load]);

  // Files that are waiting to be sent open from the phone's copy
  useEffect(() => {
    const made: string[] = [];
    const map: Record<string, string> = {};
    for (const i of waiting) {
      if (isDocumentSave(i) && i.blob && i.path) { const u = URL.createObjectURL(i.blob); made.push(u); map[i.path] = u; }
    }
    setLocalUrls(map);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [waiting]);

  // A photo or PDF sent here by Scan or Upload on the dashboard: open the form with it, as if it had just been picked
  useEffect(() => {
    if (tripId || new URLSearchParams(window.location.search).get("quick") !== "1") return;
    takeQuickScan("document").then((f) => {
      if (f) handedOver.current = true;
      if (!f) {
        if (handedOver.current) return; // development runs this effect twice; the first run already took the photo
        // Opened from Scan / Upload but the photo did not come along: say so instead of showing an empty page
        setError("We could not carry your photo over. Tap Add document and choose it again.");
        return;
      }
      setEditing(null);
      setAdding(true);
      pick(f, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the page opens
  }, []);

  const reset = () => { setEditing(null); setNumber(""); setTitle(""); setCountry(""); setExpiry(""); setNotes(""); setShowOn("both"); setFile(null); setOriginal(null); setCropped(null); setCropping(null); setSizes(null); setQuality("standard"); setKind(defaultKind); setAdding(false); setScanNote(null); };

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
    setShowOn(docScope(d));
    setFile(null);
    setOriginal(null);
    setCropped(null);
    setSizes(null);
    setAdding(true);
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
      // Read from the phone, so it works with no connection
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save the document.");
      const fields = { kind, title: label, document_number: number, issuing_country: country, expiry_date: kindHasExpiry(kind) ? expiry || null : null, notes, show_on: showOn, file, prepared: !!cropped && file === preparedFile.current };
      const { file: picked, prepared, ...rest } = fields;
      await saveDocument({
        api: makeDocumentApi(supabase), store: browserOutbox, userId: uid, doc: editing, tripId, fields: rest, file: picked, prepared,
        waiting: waiting.find((i) => i.id === editing?.id) ?? null,
        keep: (path, blob) => browserBlobs.put(`${DOC_BUCKET}/${path}`, blob),
      });
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
          : source === "ocr"
          ? "The AI reader was not available, so we read the printed text on this device. Please check the number and expiry date carefully before saving."
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

  const confirm = useConfirm();
  const remove = async (d: TravelDocument) => {
    if (!(await confirm({ title: "Delete document?", message: `Delete "${d.title}"?`, destructive: true }))) return;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to delete the document.");
      await deleteDocument({ api: makeDocumentApi(supabase), store: browserOutbox, userId: session.user.id, doc: d, waiting: waiting.find((i) => i.id === d.id) ?? null });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const today = todayISO();

  /** Closes the popup; asks first when something was typed or a file was chosen that would be lost. */
  const requestClose = async () => {
    if (saving) return;
    const dirty = editing ? !!file || showOn !== docScope(editing) : !!(title.trim() || number.trim() || country.trim() || expiry || notes.trim() || file);
    if (dirty && !(await confirm({ title: "Discard this document?", message: "What you entered will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))) return;
    reset();
  };

  // Escape closes the popup (unless the crop screen is on top), and the page behind does not scroll
  useEffect(() => {
    if (!adding) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !cropping) requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose reads the latest state each render
  }, [adding, cropping, title, number, country, expiry, notes, file, editing, saving]);

  const openAdd = () => {
    setEditing(null);
    setAdding(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <div className={tripId ? "space-y-3" : "space-y-6"}>
      {!tripId && (
        <PageHeader
          title="Documents"
          description="Your passport, ID, driver's license and travel papers, close at hand. We keep track of what is still valid."
          actions={<Button type="button" className="w-full gap-2 sm:w-auto" onClick={openAdd}><Plus className="h-4 w-4" /> Add document</Button>}
        />
      )}
      {cropping && <ReceiptCropper file={cropping.file} title="Crop to the part you need" hint="Keep the whole page in view, including the two lines of < < < at the bottom of a passport." initialCrop={{ x: 2, y: 2, w: 96, h: 96 }} onDone={onCropped} onCancel={() => { setCropping(null); if (!cropped) { setOriginal(null); } }} />}
      {viewing && <DocumentViewer {...viewing} onClose={() => setViewing(null)} />}
      {!tripId && <OfflineNotice savedAt={savedAt} writable />}
      {waitingHere > 0 && <p data-testid="docs-waiting" className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> {waitingHere} waiting to sync</p>}
      {error && !adding && <Alert>{error}</Alert>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleDocs.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">{tripId ? "No documents for this trip yet. Add your ticket, booking, visa or insurance so it is close at hand." : "No documents yet. Start with your passport."}</p>
      ) : (
        <DocumentList
          docs={visibleDocs} urls={{ ...urls, ...localUrls }} revealed={revealed} toggleReveal={toggleReveal} today={today} compact={!!tripId}
          onView={(d, url) => d.file_path && setViewing({ title: d.title, url, path: d.file_path })} onEdit={startEdit} onRemove={remove}
        />
      )}

      {adding ? (
        <div
          className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
        >
        <form ref={formRef} onSubmit={save} role="dialog" aria-modal="true" aria-label={editing ? "Edit document" : "Add document"} className="flex max-h-full w-full max-w-lg flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-lg font-bold">{editing ? "Edit document" : "Add document"}</h2>
            <button type="button" onClick={requestClose} disabled={saving} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          {error && <Alert>{error}</Alert>}
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
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
              <Select value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
                {DOC_KINDS.filter((k) => tripId ? k.value !== "passport" : true).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
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
                if (f.type.startsWith("image/")) pick(f, true); // a photo is read straight away, like a scan
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
                <button type="button" onClick={() => setCropping({ file: original, thenScan: false })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-accent">
                  <Crop className="h-3.5 w-3.5" /> Crop again
                </button>
                <label className="sr-only" htmlFor="doc-quality">Photo quality</label>
                <Select id="doc-quality" className="w-auto min-w-fit h-8 px-2 text-xs py-0" value={quality} onChange={(e) => changeQuality(e.target.value as DocQuality)} title={DOC_QUALITY[quality].hint}>
                  {(Object.keys(DOC_QUALITY) as DocQuality[]).map((q) => <option key={q} value={q}>{DOC_QUALITY[q].label}</option>)}
                </Select>
              </div>
            )}
          </div>
          {!tripId && (
            <div role="group" aria-labelledby="doc-show-on" data-testid="doc-show-on">
              <span id="doc-show-on" className="text-xs text-muted-foreground">Show on</span>
              <div className="mt-1 flex gap-1 rounded-2xl bg-muted p-1">
                {DOC_SCOPES.map((o) => (
                  <button key={o.value} type="button" aria-pressed={showOn === o.value} onClick={() => setShowOn(o.value)}
                    className={`min-h-11 flex-1 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${showOn === o.value ? "bg-raised font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground hover:text-foreground"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {showOn === "both" ? "Listed on the Personal and the Business dashboard." : showOn === "personal" ? "Listed on the Personal dashboard only." : "Listed on the Business dashboard only."} It is never copied, so edits show everywhere it is listed.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={1000} />
          </div>
          {kind === "passport" && <p className="text-xs text-muted-foreground">Only the expiry date is needed for reminders. The number is optional and shown hidden by default. Your documents are stored privately and only you can open them. When AI reading is on, the photo is sent to the AI service to read it.</p>}
          </div>
          <div className="flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end">
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving} className="h-11 w-28 sm:order-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1 gap-2 sm:order-2 sm:flex-none sm:px-8">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : editing ? "Save changes" : "Save document"}</Button>
          </div>
        </form>
        </div>
      ) : tripId ? (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => { setEditing(null); setAdding(true); }}>
          <Plus className="h-4 w-4" /> Add document
        </Button>
      ) : null}
    </div>
  );
}
