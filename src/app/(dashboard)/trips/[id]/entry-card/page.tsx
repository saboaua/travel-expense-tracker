"use client";

import { useBrand } from "@/lib/use-brand";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check, Copy, FileText, Lock, Plane } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { currentPassport } from "@/lib/documents";
import { FLIGHT_COLS } from "@/lib/columns";
import type { TripFlight } from "@/lib/flights";
import { DETAILS_COLS, ENTRY_CARD_TITLE, ENTRY_CARD_URL, EMPTY_DETAILS, buildAnswers, cleanDetails, homeFlight, missingDetails, type AnswerRow, type EntryDetails } from "@/lib/entry-card";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

const masked = (v: string) => (v.length > 4 ? `•••••• ${v.slice(-4)}` : "••••••");

function Row({ r, copied, onCopy }: { r: AnswerRow; copied: boolean; onCopy: (r: AnswerRow) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{r.label}</p>
        {r.missing ? <p className="text-sm font-semibold text-red-700 dark:text-red-300">Missing</p> : (
          <p className="truncate text-base font-bold" data-testid={`answer-${r.id}`}>
            {r.secret && !show ? masked(r.value) : r.value}
            {r.secret && <button type="button" onClick={() => setShow((v) => !v)} className="ml-2 text-xs font-semibold text-primary">{show ? "Hide" : "Show"}</button>}
          </p>
        )}
      </div>
      {!r.missing && (
        <button type="button" onClick={() => onCopy(r)} aria-label={`Copy ${r.label}`} className={`inline-flex h-11 min-w-[92px] items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${copied ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
          {copied ? <><Check className="h-4 w-4" aria-hidden /> Copied</> : <><Copy className="h-4 w-4" aria-hidden /> Copy</>}
        </button>
      )}
    </div>
  );
}

export default function EntryCardPage() {
  const { appName } = useBrand();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "ready" | "setup" | "error">("loading");
  const [details, setDetails] = useState<EntryDetails>(EMPTY_DETAILS);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [flight, setFlight] = useState<TripFlight | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setError("Sign in again to see your card answers."); return setState("error"); }
    const [det, trip, fl, doc, doneRow] = await Promise.all([
      supabase.from("entry_card_details").select(DETAILS_COLS).eq("user_id", uid).maybeSingle(),
      supabase.from("trips").select("destination").eq("id", id).maybeSingle(),
      supabase.from("trip_flights").select(FLIGHT_COLS).eq("trip_id", id).eq("user_id", uid),
      supabase.from("travel_documents").select("kind, expiry_date").eq("user_id", uid).eq("kind", "passport"),
      supabase.from("trip_entry_cards").select("done_at").eq("trip_id", id).maybeSingle(),
    ]);
    if (det.error || doneRow.error) {
      if (/relation|schema cache|does not exist/i.test((det.error ?? doneRow.error)?.message ?? "")) return setState("setup");
      setError("Could not load your card answers. Check your connection and try again."); return setState("error");
    }
    setDetails(cleanDetails(det.data));
    setExpiry(currentPassport(doc.data ?? [])?.expiry_date ?? null);
    setFlight(homeFlight((fl.data ?? []) as unknown as TripFlight[]));
    const dest = String((trip.data as { destination?: string | null } | null)?.destination ?? "");
    setCountry(dest.includes(",") ? dest.split(",").pop()!.trim() : null);
    setDone(!!doneRow.data);
    setState("ready");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const arrivalDay = flight ? (flight.arr_local?.slice(0, 10) || flight.flight_date) : null;
  const sections = useMemo(() => buildAnswers(details, expiry, flight, arrivalDay, country), [details, expiry, flight, arrivalDay, country]);
  const missing = missingDetails(details, expiry);

  const copy = async (r: AnswerRow) => {
    try { await navigator.clipboard.writeText(r.value); setCopiedId(r.id); setTimeout(() => setCopiedId((c) => (c === r.id ? null : c)), 2500); } catch { setError("Could not copy. Select the answer and copy it by hand."); }
  };
  const mark = async (on: boolean) => {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setBusy(false); return setError("Sign in again to save."); }
    const r = on ? await supabase.from("trip_entry_cards").upsert({ trip_id: id, user_id: uid }) : await supabase.from("trip_entry_cards").delete().eq("trip_id", id);
    setBusy(false);
    if (r.error) return setError("Could not save. Check your connection and try again.");
    setDone(on);
  };

  return (
    <div className={`${PAGE_WIDTH.formColumn} space-y-4 px-4 pb-28 pt-4`}>
      <BackLink href={`/trips/${id}`}>Trip</BackLink>
      <PageHeader title={ENTRY_CARD_TITLE} description="Copy each answer into the card site, in the same order." />
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state === "setup" && <Alert variant="warning">This needs one database update. Ask the admin to run migration_entry_card.sql.</Alert>}
      {state === "error" && error && <Alert variant="error">{error}</Alert>}
      {state === "ready" && (
        <>
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-relaxed text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{appName} does not fill in or send the card. You paste the answers, check the last page and tap Submit yourself.</p>
          </div>
          {!flight && <Alert variant="warning">Add your flight home to this trip to get the arrival answers.</Alert>}
          {missing.length > 0 && (
            <Alert variant="warning">
              Still needed: {missing.join(", ")}. <Link href="/profile/entry-card" className="font-semibold underline">Add your details</Link>
            </Alert>
          )}
          <a href={ENTRY_CARD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Plane className="h-4 w-4" aria-hidden /> Open edcardaruba.aw
          </a>
          {sections.map((s) => (
            <section key={s.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid={`section-${s.id}`}>
              <div className="flex items-center justify-between bg-muted/50 px-4 py-3">
                <h2 className="text-sm font-bold">{s.title}</h2>
                <span className="text-xs text-muted-foreground">{s.manual ? "you do this one" : `${s.rows.length} answers`}</span>
              </div>
              {s.rows.map((r) => <Row key={r.id} r={r} copied={copiedId === r.id} onCopy={copy} />)}
            </section>
          ))}
          {error && <Alert variant="error">{error}</Alert>}
          <Link href={`/trips/${id}/papers/new?title=${encodeURIComponent(ENTRY_CARD_TITLE + " confirmation")}`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <FileText className="h-4 w-4" aria-hidden /> Attach my confirmation
          </Link>
          {done ? (
            <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => mark(false)}>Card is done. Tap to undo</Button>
          ) : (
            <Button className="h-12 w-full" disabled={busy} onClick={() => mark(true)}><Check className="h-4 w-4" aria-hidden /> Mark card as done</Button>
          )}
        </>
      )}
    </div>
  );
}
