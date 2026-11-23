"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, Check, Mic, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeReminder, dueText, filterReminders, overdueOf, parseQuickAdd, quickWhen, repeatLabel, statusOf, type Filter, type Reminder } from "@/lib/reminders";
import { ReminderBadge } from "./reminder-icons";

export const REMINDER_COLS = "id, user_id, title, notes, due_at, repeat, repeat_days, tz, alert, color, icon, done_at, snoozed_until, last_alerted_for, created_at";

export function setupMessage(m: string) {
  return /relation|does not exist|schema cache/i.test(m) ? "Reminders are not set up yet. Run supabase/migration_reminders.sql in the Supabase SQL Editor." : m;
}

type SpeechCtor = new () => { lang: string; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start: () => void };

export function RemindersList() {
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("today");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const canSpeak = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    canSpeak.current = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setMe(session.user.id);
    const { data, error: e } = await supabase.from("reminders").select(REMINDER_COLS).order("due_at", { ascending: true }).limit(500);
    if (e) { setError(setupMessage(e.message)); return setList([]); }
    setError(null);
    setList(((data ?? []) as Reminder[]).map(normalizeReminder));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    const raw = text.trim();
    if (!raw || !me || busy) return;
    setBusy(true);
    const p = parseQuickAdd(raw, new Date());
    const q = quickWhen(new Date());
    const nine = new Date(); nine.setHours(9, 0, 0, 0);
    const due = p.due ?? (nine > new Date() ? nine : q.tomorrow);
    const { error: err } = await createClient().from("reminders").insert({ user_id: me, title: (p.title || raw).slice(0, 120), due_at: due.toISOString() });
    setBusy(false);
    if (err) return setError(setupMessage(err.message));
    setText("");
    load();
  }

  function listen() {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.onresult = (ev) => { const t = ev.results[0]?.[0]?.transcript; if (t) setText(t); };
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  }

  async function tick(r: Reminder) {
    const { error: err } = await createClient().rpc("complete_reminder", { rid: r.id });
    if (err) return setError(/not_allowed/.test(err.message) ? "You can only view this reminder." : setupMessage(err.message));
    load();
  }

  const counts = useMemo(() => {
    const l = list ?? [];
    return (["today", "upcoming", "all", "done"] as Filter[]).map((f) => ({ id: f, label: f === "today" ? "Today" : f === "upcoming" ? "Upcoming" : f === "all" ? "All" : "Done", count: filterReminders(l, f, now).length }));
  }, [list, now]);
  const shown = useMemo(() => filterReminders(list ?? [], filter, now), [list, filter, now]);
  const overdue = filter === "done" || filter === "upcoming" ? [] : overdueOf(shown, now);
  const rest = shown.filter((r) => !overdue.includes(r));

  const row = (r: Reminder) => {
    const over = statusOf(r, now) === "overdue";
    const isDone = !!r.done_at;
    const shared = me && r.user_id !== me;
    return (
      <li key={r.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="reminder-row">
        <button type="button" onClick={() => !isDone && tick(r)} disabled={isDone} aria-label={isDone ? `${r.title} is done` : `Mark ${r.title} done`} data-testid="reminder-tick"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${isDone ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/40"}`}>
          {isDone && <Check className="h-4 w-4" />}
        </button>
        <Link href={`/personal/reminders/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <ReminderBadge icon={r.icon} color={r.color} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-semibold ${isDone ? "text-muted-foreground line-through" : ""}`}>{r.title}</span>
            <span className={`block truncate text-xs ${over ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              {over ? "Overdue · " : ""}{dueText(r.snoozed_until ?? r.due_at, now)}{r.repeat !== "none" ? ` · ${repeatLabel(r)}` : ""}{shared ? " · Shared with you" : ""}
            </span>
          </span>
          {shared && <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-3" data-testid="reminders">
      <form onSubmit={add} className="flex items-center gap-2 rounded-2xl border bg-card p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Remind me to… e.g. Pay rent Fri 9am" aria-label="New reminder" maxLength={120} data-testid="reminder-quick"
          className="h-11 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-[15px] outline-none placeholder:text-muted-foreground" />
        {canSpeak.current && <button type="button" onClick={listen} aria-label="Speak a reminder" className={`flex h-11 w-11 items-center justify-center rounded-xl ${listening ? "bg-red-100 text-red-600" : "text-muted-foreground hover:bg-muted"}`}><Mic className="h-5 w-5" /></button>}
        <button type="submit" disabled={!text.trim() || busy} aria-label="Add reminder" data-testid="reminder-quick-add" className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-5 w-5" /></button>
      </form>
      <div className="flex justify-end -mt-1"><Link href="/personal/reminders/new" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" data-testid="reminder-new">More options</Link></div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-testid="reminders-error">{error}</p>}
      <Tabs options={counts} value={filter} onChange={(v) => setFilter(v as Filter)} label="Show reminders" fullWidth size="sm" />

      {list === null ? <Skeleton className="h-40 w-full rounded-2xl" /> : shown.length === 0 ? (
        <EmptyState icon={BellRing} tone="notifications" testId="reminders-empty" title={filter === "done" ? "Nothing done yet" : filter === "today" ? "Nothing for today" : "No reminders"}
          action={<Button type="button" className="h-11 px-5" onClick={() => document.querySelector<HTMLInputElement>('[data-testid="reminder-quick"]')?.focus()}><Plus className="h-4 w-4" /> Add a reminder</Button>}>
          Type what you need to remember above. Add a day or time, like “Fri 9am”.
        </EmptyState>
      ) : (
        <>
          {overdue.length > 0 && <div><h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Overdue</h2><Card className="rounded-2xl"><ul className="divide-y">{overdue.map(row)}</ul></Card></div>}
          {rest.length > 0 && <Card className="rounded-2xl"><ul className="divide-y" data-testid="reminders-list">{rest.map(row)}</ul></Card>}
        </>
      )}
    </div>
  );
}
