"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BellRing, Check, ChevronRight, Copy, ListChecks, Lock, MoreVertical, Plus, Trash2 } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { OfflineNotice } from "@/components/OfflineNotice";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { checklistKey, checklistTripKey, fetchChecklist, type ChecklistTrip } from "@/lib/offline-data";
import { createClient } from "@/lib/supabase/client";
import { browserOutbox } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { applyRows, deleteRow, makeRowApi, saveRow, waitingParents } from "@/lib/row-outbox";
import { CATEGORIES, CHECKLIST_TABLE, MAX_ITEMS, cleanCategory, copyItems, groupItems, parseItem, pastLists, progress, type ChecklistCategory, type ChecklistItem, type PastList } from "@/lib/trip-checklist";
import { cn } from "@/lib/utils";

const TONE: Record<ChecklistCategory, string> = { documents: "#4f46e5", clothes: "#c026d3", tech: "#0284c7", health: "#dc2626", other: "#475569" };

function Checklist() {
  const { id } = useParams<{ id: string }>();
  const wantCopy = useSearchParams().get("copy") === "1";
  const [uid, setUid] = useState<string | null>(null);
  const [trip, setTrip] = useState<ChecklistTrip | null>(null);
  const [raw, setRaw] = useState<ChecklistItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ChecklistCategory>("other");
  const [menu, setMenu] = useState(false);
  const [reminder, setReminder] = useState<boolean | null>(null);
  const [lists, setLists] = useState<{ same: PastList[]; others: PastList[] } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [showOthers, setShowOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const copied = useRef(false);
  const { items: pending } = useOutbox(uid);

  const load = useCallback(async () => {
    const supabase = createClient();
    // The session is read from the phone, so this also works with no connection
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user.id;
    if (!user) { setError("Sign in again to see your checklist."); setState("ready"); return; }
    setUid(user);
    const [t, c] = await Promise.all([
      loadWithCache(browserKv, checklistTripKey(user, id), () => supabase.from("trips").select("id, name, destination, start_date, end_date").eq("id", id).maybeSingle()),
      loadWithCache(browserKv, checklistKey(user, id), () => fetchChecklist(supabase, id)),
    ]);
    if (t.ok && t.data) setTrip(t.data as unknown as ChecklistTrip);
    if (!c.ok) {
      const message = (c.error as { message?: string } | null)?.message || "";
      if (/relation|schema cache/i.test(message)) return setState("setup");
      setError("Could not load the checklist. Check your connection and try again.");
      return setState("ready");
    }
    setRaw(c.data);
    setSavedAt(c.fromCache ? c.savedAt : null);
    setState("ready");
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Is the reminder switched on in Phone alerts?
  useEffect(() => {
    fetch("/api/push/prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((p) => setReminder(p?.prefs ? p.prefs.checklist !== false : null)).catch(() => setReminder(null));
  }, []);

  const items = useMemo(
    () => applyRows(raw, pending, CHECKLIST_TABLE, (r) => r.trip_id === id).map((x) => ({ ...x, category: cleanCategory(x.category), done: x.done === true, sort: Number(x.sort) || 0 })),
    [raw, pending, id],
  );
  const groups = useMemo(() => groupItems(items), [items]);
  const { done, total } = progress(items);

  // Lists from other trips, for copying (needs a connection)
  const loadLists = useCallback(async () => {
    if (!trip || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const supabase = createClient();
    const [tr, rows] = await Promise.all([
      supabase.from("trips").select("id, name, destination, start_date").order("start_date", { ascending: false }).limit(500),
      supabase.from("trip_checklist_items").select("trip_id").limit(10000),
    ]);
    if (tr.error || rows.error) return;
    const counts: Record<string, number> = {};
    for (const r of (rows.data ?? []) as { trip_id: string }[]) counts[r.trip_id] = (counts[r.trip_id] ?? 0) + 1;
    setLists(pastLists({ id, destination: trip.destination }, (tr.data ?? []) as { id: string; name: string; destination: string | null; start_date: string | null }[], counts));
  }, [trip, id]);
  useEffect(() => { if (state === "ready" && total === 0) void loadLists(); }, [state, total, loadLists]);

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error && e.message ? e.message : fail); }
    await load();
  };
  const api = () => makeRowApi(createClient());
  const waitingOf = (rowId: string) => pending.find((i) => i.id === rowId) ?? null;

  const toggle = (item: ChecklistItem) => uid && run(() => saveRow({ api: api(), store: browserOutbox, userId: uid, table: CHECKLIST_TABLE, id: item.id, row: { done: !item.done }, waiting: waitingOf(item.id), label: item.title, summary: "Checklist · ticked" }), "Could not save. Try again.");
  const remove = (item: ChecklistItem) => uid && run(() => deleteRow({ api: api(), store: browserOutbox, userId: uid, table: CHECKLIST_TABLE, id: item.id, waiting: waitingOf(item.id), label: item.title, summary: "Checklist · removed" }), "Could not delete. Try again.");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    const p = parseItem({ title, category });
    if (!p.ok) return setError(p.error);
    if (items.length >= MAX_ITEMS) return setError(`A checklist holds up to ${MAX_ITEMS} things.`);
    setTitle("");
    await run(async () => saveRow({
      api: api(), store: browserOutbox, userId: uid, table: CHECKLIST_TABLE,
      row: { trip_id: id, title: p.title, category: p.category, done: false, sort: items.reduce((m, i) => Math.max(m, i.sort), 0) + 1 },
      dependsOn: await waitingParents(browserOutbox, [id]), label: p.title, summary: "Checklist · new",
    }), "Could not add it. Try again.");
  };

  const untickAll = async () => {
    setMenu(false);
    if (!uid) return;
    for (const i of items.filter((x) => x.done)) await saveRow({ api: api(), store: browserOutbox, userId: uid, table: CHECKLIST_TABLE, id: i.id, row: { done: false }, waiting: waitingOf(i.id), label: i.title, summary: "Checklist · unticked" }).catch(() => {});
    await load();
  };

  /** Brings in the things from the chosen trips: unticked, nothing twice. */
  const copyFrom = async (tripIds: string[]) => {
    if (!uid || !tripIds.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return setError("Copying a list needs a connection.");
    setBusy(true); setError(null);
    const supabase = createClient();
    const got = await Promise.all(tripIds.map((t) => fetchChecklist(supabase, t)));
    if (got.some((g) => g.error)) { setBusy(false); return setError("Could not read that list. Try again."); }
    const add = copyItems(items, got.map((g) => g.data ?? []), items.reduce((m, i) => Math.max(m, i.sort), 0) + 1).slice(0, MAX_ITEMS - items.length);
    if (!add.length) { setBusy(false); setSheet(false); return setError("Everything on that list is already here."); }
    const { error: err } = await supabase.from(CHECKLIST_TABLE).insert(add.map((a) => ({ ...a, trip_id: id, user_id: uid })));
    setBusy(false);
    if (err) return setError("Could not copy the list. Try again.");
    setSheet(false);
    await load();
  };

  // "Copy it" on the dashboard card: bring in the list from the same place straight away
  useEffect(() => {
    if (!wantCopy || copied.current || state !== "ready" || total > 0 || !lists?.same.length) return;
    copied.current = true;
    void copyFrom([lists.same[0].tripId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCopy, state, total, lists]);

  const openSheet = async () => {
    setMenu(false);
    if (!lists) await loadLists();
    setPicked((lists?.same ?? []).map((l) => l.tripId));
    setSheet(true);
  };
  const togglePick = (tripId: string) => setPicked((p) => (p.includes(tripId) ? p.filter((x) => x !== tripId) : [...p, tripId]));
  const pickedCount = [...(lists?.same ?? []), ...(lists?.others ?? [])].filter((l) => picked.includes(l.tripId)).reduce((n, l) => n + l.count, 0);
  const suggestion = total === 0 && lists?.same[0];
  const place = trip?.destination?.split(/[,;(]/)[0].trim() || "";

  if (sheet) {
    const row = (l: PastList) => (
      <button key={l.tripId} type="button" onClick={() => togglePick(l.tripId)} aria-pressed={picked.includes(l.tripId)} data-testid="copy-option" className="flex min-h-16 w-full items-center gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg", picked.includes(l.tripId) ? "bg-primary text-primary-foreground" : "border-2 border-slate-400")} aria-hidden="true">{picked.includes(l.tripId) && <Check className="h-4 w-4" />}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{l.name}</span><span className="block truncate text-[12.5px] text-muted-foreground">{[l.destination, l.startDate ? new Date(`${l.startDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""].filter(Boolean).join(" · ")}</span></span>
        <span className="text-[13px] font-bold text-muted-foreground">{l.count} thing{l.count === 1 ? "" : "s"}</span>
      </button>
    );
    return (
      <div className="mx-auto max-w-xl space-y-5 p-4 pb-28 md:p-8">
        <button type="button" onClick={() => setSheet(false)} className="inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">‹ Checklist</button>
        <PageHeader title="Copy from an earlier trip" description="Same place, so you do not start from zero" />
        {error && <Alert>{error}</Alert>}
        {lists?.same.length ? <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-50">You went to <b>{place}</b> {lists.same.length === 1 ? "once" : `${lists.same.length} times`} before. Tick the lists to bring in.</div> : null}
        {lists?.same.length ? <Card><CardContent className="divide-y px-4 py-1">{lists.same.map(row)}</CardContent></Card> : null}
        {lists?.others.length ? (
          <>
            <button type="button" onClick={() => setShowOthers((v) => !v)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-sm" data-testid="copy-other">
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold">Pick a different trip</span><span className="block text-[12.5px] text-muted-foreground">Any trip with a list</span></span>
              <ChevronRight className={cn("h-5 w-5 text-muted-foreground transition-transform", showOthers && "rotate-90")} aria-hidden="true" />
            </button>
            {showOthers && <Card><CardContent className="divide-y px-4 py-1">{lists.others.map(row)}</CardContent></Card>}
          </>
        ) : null}
        {!lists?.same.length && !lists?.others.length && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">You have no earlier lists to copy yet.</CardContent></Card>}
        <p className="text-sm text-muted-foreground">Everything comes in <b>unticked</b>, and the same thing from two trips is added once. You can edit or remove items before you go.</p>
        <Button className="min-h-[52px] w-full text-base font-bold" disabled={busy || !picked.length} onClick={() => copyFrom(picked)} data-testid="copy-confirm"><Check className="mr-2 h-5 w-5" aria-hidden="true" />{picked.length ? `Add ${pickedCount} thing${pickedCount === 1 ? "" : "s"}` : "Pick a list"}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28 md:p-8">
      <BackLink href={`/trips/${id}`}>{trip?.name ?? "Trip"}</BackLink>
      <div className="relative">
        <PageHeader title="Checklist" description={trip ? [trip.name, place].filter(Boolean).join(" · ") : undefined} actions={state === "ready" ? (
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu} className="inline-flex h-11 w-11 items-center justify-center rounded-full border bg-card hover:bg-accent max-sm:!w-11" data-testid="checklist-menu"><MoreVertical className="h-5 w-5" aria-hidden="true" /></button>
        ) : null} />
        {menu && (
          <div className="absolute right-0 top-16 z-10 w-64 overflow-hidden rounded-xl border bg-card shadow-lg" role="menu">
            <button type="button" role="menuitem" onClick={() => void openSheet()} className="flex min-h-12 w-full items-center gap-2.5 px-4 text-left text-sm font-semibold hover:bg-accent" data-testid="checklist-copy-menu"><Copy className="h-4 w-4" aria-hidden="true" />Copy from an earlier trip</button>
            <button type="button" role="menuitem" onClick={() => void untickAll()} disabled={done === 0} className="flex min-h-12 w-full items-center gap-2.5 border-t px-4 text-left text-sm font-semibold hover:bg-accent disabled:opacity-50"><ListChecks className="h-4 w-4" aria-hidden="true" />Untick everything</button>
          </div>
        )}
      </div>
      {state === "setup" && <Alert>The checklist is not set up yet. Run supabase/migration_trip_checklist.sql in the Supabase SQL Editor.</Alert>}
      <OfflineNotice savedAt={savedAt} writable />
      {error && <Alert>{error}</Alert>}
      {state === "ready" && (
        <>
          <div className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="checklist-progress">
            <div className="flex items-baseline justify-between"><span className="text-[26px] font-extrabold tabular-nums">{done} of {total}</span><span className="text-[13px] text-muted-foreground">ticked</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(total, 1)} aria-valuenow={done} aria-label="Checklist progress"><div className={cn("h-2", total > 0 && done === total ? "bg-emerald-500" : "bg-primary")} style={{ width: `${total ? Math.round((100 * done) / total) : 0}%` }} /></div>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground"><Lock className="h-4 w-4" aria-hidden="true" />Only you see this list</p>
            {reminder !== null && (reminder
              ? <p className="mt-1.5 flex items-center gap-2 text-[13px] font-bold text-emerald-700 dark:text-emerald-300" data-testid="checklist-reminder"><BellRing className="h-4 w-4" aria-hidden="true" />Reminder on: 2 days and 1 day before you leave</p>
              : <p className="mt-1.5 text-[13px] text-muted-foreground" data-testid="checklist-reminder"><Link href="/profile#notifications" className="font-semibold text-primary underline">Turn on Trip checklist</Link> in Phone alerts to get a reminder.</p>)}
            {total > 0 && done === total && <p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300" data-testid="checklist-ready"><Check className="h-4 w-4" aria-hidden="true" />Everything is ready for the trip</p>}
          </div>

          {suggestion && (
            <div className="space-y-2.5 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950" data-testid="checklist-suggest">
              <p className="flex items-center gap-2.5 text-sm leading-snug text-green-950 dark:text-green-100"><Copy className="h-5 w-5 shrink-0 text-green-700" aria-hidden="true" /><span><b>You have a {suggestion.destination.split(/[,;(]/)[0].trim() || "same-place"} list.</b> Copy its {suggestion.count} thing{suggestion.count === 1 ? "" : "s"}?</span></p>
              <Button className="min-h-12 w-full font-bold" disabled={busy} onClick={() => (lists!.same.length > 1 ? void openSheet() : void copyFrom([suggestion.tripId]))} data-testid="checklist-suggest-copy"><Copy className="mr-2 h-4 w-4" aria-hidden="true" />{lists!.same.length > 1 ? "Choose lists to copy" : "Copy it"}</Button>
            </div>
          )}

          {groups.map((g) => {
            const gp = progress(g.items);
            return (
              <section key={g.id} className="space-y-2" data-testid={`checklist-group-${g.id}`}>
                <div className="flex items-center gap-2.5 px-0.5">
                  <span className="h-7 w-1.5 rounded-full" style={{ background: TONE[g.id] }} aria-hidden="true" />
                  <h3 className="flex-1 text-[15px] font-extrabold">{g.label}</h3>
                  <span className="text-[13px] font-bold text-muted-foreground">{gp.done} of {gp.total}</span>
                </div>
                <Card><CardContent className="divide-y px-4 py-0.5">
                  {g.items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 py-1" data-testid="checklist-row">
                      <button type="button" role="checkbox" aria-checked={i.done} onClick={() => void toggle(i)} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="checklist-tick">
                        <span className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg", i.done ? "bg-primary text-primary-foreground" : "border-2 border-slate-400")} aria-hidden="true">{i.done && <Check className="h-4 w-4" />}</span>
                        <span className={cn("min-w-0 flex-1 break-words text-[15.5px] font-semibold", i.done && "text-muted-foreground line-through")}>{i.title}</span>
                      </button>
                      <button type="button" onClick={() => void remove(i)} aria-label={`Remove ${i.title}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent" data-testid="checklist-remove"><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
                    </div>
                  ))}
                </CardContent></Card>
              </section>
            );
          })}

          {total === 0 && !suggestion && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground" data-testid="checklist-empty">Nothing here yet. Add what to pack and do before you go.</CardContent></Card>}

          <form onSubmit={add} className="space-y-2.5" data-testid="checklist-add">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Group">
              {CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => setCategory(c.id)} aria-pressed={category === c.id} className={cn("min-h-10 rounded-full border px-3.5 text-sm font-semibold", category === c.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{c.label}</button>)}
            </div>
            <div className="flex gap-2.5">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a thing" maxLength={120} className="h-[52px] flex-1 text-base" aria-label="Add a thing" data-testid="checklist-input" />
              <Button type="submit" className="h-[52px] px-5 font-bold" data-testid="checklist-add-button"><Plus className="mr-1.5 h-5 w-5" aria-hidden="true" />Add</Button>
            </div>
          </form>
        </>
      )}
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}

export default function TripChecklistPage() {
  return <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}><Checklist /></Suspense>;
}
