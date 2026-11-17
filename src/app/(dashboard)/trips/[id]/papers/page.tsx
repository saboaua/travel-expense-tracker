"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Clock, Crown, FileText, Plus, Ticket, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { OfflineNotice } from "@/components/OfflineNotice";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { cacheFile, fetchTripPapers, paperTripKey, papersKey, savedFileUrls } from "@/lib/offline-data";
import { createClient } from "@/lib/supabase/client";
import { PAPER_BUCKET, paperRemovalDay, paperSub, type TripPaper } from "@/lib/trip-papers";
import { formatDate, todayISO } from "@/lib/utils";
import { papersStatus } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";

function Papers() {
  const { id } = useParams<{ id: string }>();
  const openId = useSearchParams().get("open");
  const [trip, setTrip] = useState<{ name: string; end_date: string | null } | null>(null);
  const [papers, setPapers] = useState<TripPaper[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ title: string; url: string; path: string } | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const lim = useLimits();
  const cap = lim ? papersStatus(lim.limits, lim.who, papers.length, todayISO()) : null;

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const local = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    // The session is read from the phone, so this also works with no connection
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setError("Sign in again to see your trip papers."); setState("ready"); return; }
    const [t, p] = await Promise.all([
      loadWithCache(browserKv, paperTripKey(uid, id), () => supabase.from("trips").select("name, end_date").eq("id", id).maybeSingle()),
      loadWithCache(browserKv, papersKey(uid, id), () => fetchTripPapers(supabase, id)),
    ]);
    if (t.ok && t.data) setTrip(t.data as unknown as { name: string; end_date: string | null });
    if (!p.ok) {
      const message = (p.error as { message?: string } | null)?.message || "";
      if (/relation|schema cache/i.test(message)) return setState("setup");
      setError("Could not load the trip papers. Check your connection and try again.");
      return setState("ready");
    }
    setPapers(p.data);
    setSavedAt(p.fromCache ? p.savedAt : null);
    const paths = p.data.map((x) => x.file_path).filter(Boolean) as string[];
    Object.values(local.current).forEach((u) => URL.revokeObjectURL(u));
    local.current = {};
    if (p.fromCache) local.current = await savedFileUrls(PAPER_BUCKET, paths);
    else (async () => { for (const path of paths.slice(0, 25)) await cacheFile(supabase, PAPER_BUCKET, path); })(); // kept for the plane
    setState("ready");
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { Object.values(local.current).forEach((u) => URL.revokeObjectURL(u)); }, []);

  const open = useCallback(async (p: TripPaper) => {
    setError(null);
    if (!p.file_path) return; // a note has nothing to open
    const saved = local.current[p.file_path];
    if (savedAt !== null || !navigator.onLine) {
      if (saved) return setViewing({ title: p.title, url: saved, path: p.file_path });
      const blob = await savedFileUrls(PAPER_BUCKET, [p.file_path]);
      if (blob[p.file_path]) { local.current[p.file_path] = blob[p.file_path]; return setViewing({ title: p.title, url: blob[p.file_path], path: p.file_path }); }
      return setError("This file is not saved on the phone. Open it once with a connection and it will be kept.");
    }
    const { data, error: err } = await createClient().storage.from(PAPER_BUCKET).createSignedUrl(p.file_path, 600);
    if (err || !data?.signedUrl) {
      const blob = await savedFileUrls(PAPER_BUCKET, [p.file_path]);
      if (blob[p.file_path]) return setViewing({ title: p.title, url: blob[p.file_path], path: p.file_path });
      return setError("Could not open the file. Check your connection and try again.");
    }
    setViewing({ title: p.title, url: data.signedUrl, path: p.file_path });
  }, [savedAt]);
  // A paper tapped on the dashboard card opens straight away
  useEffect(() => { if (openId && state === "ready") { const p = papers.find((x) => x.id === openId); if (p) open(p); } }, [openId, state, papers, open]);

  const remove = async (p: TripPaper) => {
    setError(null);
    const supabase = createClient();
    if (p.file_path) await supabase.storage.from(PAPER_BUCKET).remove([p.file_path]);
    const { error: err } = await supabase.from("trip_papers").delete().eq("id", p.id);
    if (err) return setError("Could not delete. Try again.");
    setAsked(null);
    load();
  };

  const removalDay = paperRemovalDay(trip?.end_date);
  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28 md:p-8">
      <BackLink href={`/trips/${id}`}>{trip?.name ?? "Trip"}</BackLink>
      <PageHeader title="Trip papers" description="Transfers, tickets and booking details for this trip" />
      {state === "setup" && <Alert>Trip papers are not set up yet. Run supabase/migration_trip_papers.sql in the Supabase SQL Editor.</Alert>}
      <OfflineNotice savedAt={savedAt} />
      {error && <Alert>{error}</Alert>}
      {state === "ready" && (
        <>
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-50" data-testid="paper-removal">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
            <span>Only you see these. {removalDay ? <>They are removed on <b>{formatDate(removalDay)}</b>, 7 days after the trip ends.</> : "They are removed 7 days after the trip ends. Set an end date for the trip to see the day."}</span>
          </div>
          {cap && cap.limit != null && (
            <div className="rounded-xl border bg-card p-3" data-testid="paper-meter">
              <div className="flex items-baseline justify-between"><span className="text-sm font-extrabold">Papers on this trip</span><span className="text-[13px] font-bold text-muted-foreground">{cap.count} of {cap.limit}</span></div>
              <div className="my-2 h-2 rounded bg-muted"><div className={`h-2 rounded ${cap.full ? "bg-amber-600" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((100 * cap.count) / Math.max(1, cap.limit)))}%` }} /></div>
              <p className="text-xs text-muted-foreground">{cap.full ? (lim?.who.pro ? `This trip holds up to ${cap.limit} papers.` : `This trip is full on Free. Pro holds up to ${lim?.limits.pro_trip_papers} papers per trip.`) : `The ${lim?.who.pro ? "Pro" : "Free"} plan holds ${cap.limit} papers per trip.`}</p>
            </div>
          )}
          {papers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground" data-testid="papers-empty">Nothing here yet. Add the transfer, tickets or booking details.</CardContent></Card>
          ) : (
            <Card><CardContent className="divide-y p-0">
              {papers.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2" data-testid="paper-row">
                  <button type="button" onClick={() => open(p)} disabled={!p.file_path} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
                    <span className="tone-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#4f46e51f", color: "#4f46e5" }} aria-hidden="true">{p.file_path ? <Ticket className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{p.title}</span><span className="block truncate text-[12.5px] text-muted-foreground">{paperSub(p)}</span>{!p.file_path && p.note && <span className="mt-0.5 block whitespace-pre-line text-[13px] text-foreground/80">{p.note}</span>}</span>
                  </button>
                  {asked === p.id ? (
                    <span className="flex shrink-0 gap-1.5"><Button size="sm" variant="outline" onClick={() => setAsked(null)}>Keep</Button><Button size="sm" className="bg-red-700 text-white hover:bg-red-800" onClick={() => remove(p)} data-testid="paper-delete-yes">Delete</Button></span>
                  ) : (
                    <button type="button" onClick={() => setAsked(p.id)} aria-label={`Delete ${p.title}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent" data-testid="paper-delete"><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
                  )}
                </div>
              ))}
            </CardContent></Card>
          )}
          {cap?.full ? (
            lim?.who.pro ? null : <Link href="/personal/pro" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card px-4 text-[15px] font-bold hover:bg-accent" data-testid="paper-get-pro"><Crown className="h-5 w-5 text-primary" aria-hidden="true" />Get Pro to add more</Link>
          ) : (
            <Link href={`/trips/${id}/papers/new`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground hover:bg-primary/90" data-testid="paper-add"><Plus className="h-5 w-5" aria-hidden="true" />Add paper</Link>
          )}
        </>
      )}
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {viewing && <DocumentViewer title={viewing.title} url={viewing.url} path={viewing.path} onClose={() => setViewing(null)} />}
    </div>
  );
}

export default function TripPapersPage() {
  return <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}><Papers /></Suspense>;
}
