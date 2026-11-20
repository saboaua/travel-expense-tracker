"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, Check, Paperclip, X } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { compressReceiptImage } from "@/lib/compress-image";
import { ALLOWED, DOC_ACCEPT, MAX_DOC_BYTES, formatBytes, safeName } from "@/lib/document-upload";
import { PAPER_BUCKET, paperRemovalDay, parsePaper } from "@/lib/trip-papers";
import { formatDate, todayISO } from "@/lib/utils";
import { papersStatus } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";

export default function NewTripPaperPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("title") ?? "").slice(0, 120)));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const lim = useLimits();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => { createClient().from("trips").select("end_date").eq("id", id).maybeSingle().then(({ data }) => setEndDate((data?.end_date as string | null) ?? null)); }, [id]);

  const choose = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED.has(f.type)) return setError("Use a PDF or a photo (JPG, PNG, WebP or HEIC).");
    if (f.size > MAX_DOC_BYTES) return setError("That file is over 10 MB. Use a smaller photo or PDF.");
    setFile(f);
  };

  const save = async () => {
    const parsed = parsePaper({ title, note });
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) throw new Error("Sign in again to save.");
      if (lim) {
        const { count } = await supabase.from("trip_papers").select("id", { count: "exact", head: true }).eq("trip_id", id);
        const cap = papersStatus(lim.limits, lim.who, count ?? 0, todayISO());
        if (cap.full) throw new Error(`Your ${lim.who.pro ? "Pro" : "Free"} plan holds ${cap.limit} papers per trip.${lim.who.pro ? "" : " Get Pro to add more."}`);
      }
      let path: string | null = null;
      if (file) {
        let f = file;
        if (f.type.startsWith("image/") && f.type !== "image/heic" && f.type !== "image/heif") f = await compressReceiptImage(f, { maxSide: 1600, quality: 0.75 }).catch(() => f);
        path = `${uid}/papers/${id}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error: up } = await supabase.storage.from(PAPER_BUCKET).upload(path, f, { contentType: f.type, upsert: false });
        if (up) throw new Error(up.message);
      }
      const { error: ins } = await supabase.from("trip_papers").insert({ user_id: uid, trip_id: id, title: parsed.title, note: parsed.note, file_path: path });
      if (ins) {
        if (path) await supabase.storage.from(PAPER_BUCKET).remove([path]);
        throw new Error(/trip_papers/.test(ins.message) ? "Trip papers are not set up yet. Run supabase/migration_trip_papers.sql." : "Could not save. Check your connection and try again.");
      }
      router.push(`/trips/${id}/papers`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  const removal = paperRemovalDay(endDate);
  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28 md:p-8">
      <BackLink href={`/trips/${id}/papers`}>Trip papers</BackLink>
      <PageHeader title="Add paper" description="A transfer, ticket or booking for this trip" />
      {error && <Alert>{error}</Alert>}
      <Card><CardContent className="space-y-4 py-4">
        <div className="space-y-1.5"><label htmlFor="paper-title" className="text-sm font-semibold">Title</label><Input id="paper-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Transfer arrival" data-testid="paper-title" /></div>
        <div className="space-y-1.5"><label htmlFor="paper-note" className="text-sm font-semibold">Note (optional)</label><textarea id="paper-note" value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Driver Luis +507 6123 4567" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px]" data-testid="paper-note" /></div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Photo or PDF (optional)</p>
          {file ? (
            <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-muted/40 px-3" data-testid="paper-file"><Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-sm">{file.name} · {formatBytes(file.size)}</span><button type="button" onClick={() => setFile(null)} aria-label="Remove the file" className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-accent"><X className="h-4 w-4" aria-hidden="true" /></button></div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-12 flex-1 gap-2" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" aria-hidden="true" />Take photo</Button>
              <Button type="button" variant="outline" className="min-h-12 flex-1 gap-2" onClick={() => picker.current?.click()} data-testid="paper-choose"><Paperclip className="h-4 w-4" aria-hidden="true" />Choose file</Button>
            </div>
          )}
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={picker} type="file" accept={DOC_ACCEPT} className="hidden" data-testid="paper-input" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">No expiry date and no type to choose. Removed {removal ? <>on {formatDate(removal)}, </> : ""}7 days after the trip ends.</p>
      </CardContent></Card>
      <Button onClick={save} disabled={busy} className="min-h-12 w-full gap-2 text-[15px]" data-testid="paper-save"><Check className="h-5 w-5" aria-hidden="true" />{busy ? "Saving…" : "Save"}</Button>
    </div>
  );
}
