"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Check, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useConfirm } from "@/components/ui/confirm";
import { useLimits } from "@/lib/use-limits";
import { normalizeReminder, ALERTS, SNOOZES, dueText, repeatLabel, snoozeTime, statusOf, toInput, type Reminder, type SnoozeChoice } from "@/lib/reminders";
import { ReminderBadge } from "./reminder-icons";
import { REMINDER_COLS, setupMessage } from "./RemindersList";
import { ShareSheet } from "./ShareSheet";
import { PersonAvatar } from "./PersonAvatar";
import { useReminderShares } from "./use-reminder-shares";
import { namesText } from "@/lib/reminder-partners";

/** One reminder. `embedded` is the desktop pane beside the list: it stays on the page and tells the list when something changed. */
export function ReminderDetail({ id, embedded = false, onChanged }: { id: string; embedded?: boolean; onChanged?: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const lim = useLimits();
  const [r, setR] = useState<Reminder | null | undefined>(undefined);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"snooze" | "share" | null>(null);
  const [pick, setPick] = useState(false);
  const [custom, setCustom] = useState("");
  const [canDone, setCanDone] = useState(true);
  const { shared, from, refresh: refreshShares } = useReminderShares();

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase.from("reminders").select(REMINDER_COLS).eq("id", id).maybeSingle();
    if (e) { setError(setupMessage(e.message)); return setR(null); }
    const row = data ? normalizeReminder(data as Reminder) : null;
    setR(row);
    if (!row) return;
    const ph = await supabase.from("reminder_photos").select("file_path").eq("reminder_id", id).order("created_at");
    const paths = ((ph.data ?? []) as { file_path: string }[]).map((p) => p.file_path);
    if (paths.length) {
      const s = await supabase.storage.from("reminder-photos").createSignedUrls(paths, 3600);
      setUrls((s.data ?? []).map((x) => x.signedUrl).filter(Boolean) as string[]);
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session && row.user_id !== session.user.id) {
      const sh = await supabase.from("reminder_shares").select("can_complete").eq("reminder_id", id).eq("shared_with", session.user.id).maybeSingle();
      setCanDone(!!(sh.data as { can_complete?: boolean } | null)?.can_complete);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (r === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (r === null) return <p className="rounded-xl border p-4 text-sm" data-testid="reminder-missing">{error ?? "This reminder was not found. It may have been deleted."}</p>;

  const mine = !lim || r.user_id === lim.uid;
  const now = new Date();
  const st = statusOf(r, now);
  const alertLabel = ALERTS.find((a) => a.id === r.alert)!.label;

  async function done() {
    const { error: e } = await createClient().rpc("complete_reminder", { rid: id });
    if (e) return setError(/not_allowed/.test(e.message) ? "You can only view this reminder." : setupMessage(e.message));
    if (embedded) { onChanged?.(); return load(); }
    router.push("/personal/reminders");
  }
  async function reopen() {
    const { error: e } = await createClient().from("reminders").update({ done_at: null }).eq("id", id);
    if (e) return setError(setupMessage(e.message));
    load();
  }
  async function snooze(when: Date) {
    const { error: e } = await createClient().from("reminders").update({ snoozed_until: when.toISOString(), last_alerted_for: null }).eq("id", id);
    if (e) return setError(setupMessage(e.message));
    setSheet(null); setPick(false); onChanged?.(); load();
  }
  async function remove() {
    if (!(await confirm({ title: "Delete this reminder?", message: "It and its photos are removed for good.", confirmLabel: "Delete", destructive: true }))) return;
    const supabase = createClient();
    const ph = await supabase.from("reminder_photos").select("file_path").eq("reminder_id", id);
    const paths = ((ph.data ?? []) as { file_path: string }[]).map((p) => p.file_path);
    if (paths.length) await supabase.storage.from("reminder-photos").remove(paths);
    const { error: e } = await supabase.from("reminders").delete().eq("id", id);
    if (e) return setError(setupMessage(e.message));
    if (embedded) return onChanged?.();
    router.push("/personal/reminders");
  }
  async function leave() {
    if (!(await confirm({ title: "Remove from your list?", message: "It stays with the person who shared it. You will not get its alerts.", confirmLabel: "Remove" }))) return;
    const { error: e } = await createClient().from("reminder_shares").delete().eq("reminder_id", id).eq("shared_with", lim?.uid ?? "");
    if (e) return setError(setupMessage(e.message));
    if (embedded) return onChanged?.();
    router.push("/personal/reminders");
  }
  const people = shared.get(id) ?? [];
  const sender = from.get(id);

  return (
    <div className="space-y-4" data-testid="reminder-detail">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
        <ReminderBadge icon={r.icon} color={r.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className={`text-xl font-extrabold leading-tight ${r.done_at ? "line-through" : ""}`} data-testid="reminder-detail-title">{r.title}</h1>
          <p className={`mt-0.5 text-sm ${st === "overdue" ? "font-semibold text-red-600 dark:text-red-400" : "font-medium text-muted-foreground"}`}>
            {st === "overdue" ? "Overdue · " : ""}{dueText(r.snoozed_until ?? r.due_at, now)}
          </p>
        </div>
        {mine && <Link href={`/personal/reminders/${id}/edit`} aria-label="Edit reminder" data-testid="reminder-edit" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="h-5 w-5" /></Link>}
      </div>

      {!mine && (
        <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/40" data-testid="reminder-shared-by">
          {sender && <PersonAvatar name={sender} size={40} />}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">Shared by {sender ?? "someone"}</p>
            <p className="text-xs text-violet-900 dark:text-violet-200">{canDone ? "You get the alert too. You can mark it done." : "You get the alert too. View only."}</p>
          </div>
        </div>
      )}

      <dl className="divide-y rounded-2xl border bg-card text-sm">
        <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">Repeat</dt><dd className="font-medium">{r.repeat === "none" ? "Never" : repeatLabel(r)}</dd></div>
        <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">Remind me</dt><dd className="font-medium">{alertLabel}</dd></div>
        {r.snoozed_until && <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-muted-foreground">Snoozed until</dt><dd className="font-medium">{dueText(r.snoozed_until, now)}</dd></div>}
      </dl>

      {mine && (
        <section className="rounded-2xl border bg-card p-4" aria-label="Shared with" data-testid="reminder-shared-with">
          {people.length === 0 ? (
            <button type="button" onClick={() => setSheet("share")} data-testid="reminder-share" className="flex min-h-11 w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" /><span className="flex-1 text-[15px] font-semibold">Share with someone</span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><h2 className="text-[15px] font-extrabold">Shared with {namesText(people.map((x) => x.name))}</h2><p className="text-xs text-muted-foreground">They get the alert at the same time</p></div>
                <button type="button" onClick={() => setSheet("share")} data-testid="reminder-share" className="min-h-11 px-2 text-sm font-bold text-primary">Manage</button>
              </div>
              <ul className="mt-1 divide-y" data-testid="reminder-people">
                {people.map((x) => (
                  <li key={x.partnershipId} className="flex items-center gap-3 py-2">
                    <PersonAvatar name={x.name} size={36} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{x.name}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${x.canComplete ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>{x.canComplete ? "Can mark done" : "View only"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {r.notes && <p className="whitespace-pre-wrap rounded-2xl border bg-card p-4 text-sm" data-testid="reminder-detail-notes">{r.notes}</p>}
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2" data-testid="reminder-photos">
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="Photo on this reminder" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <div className="space-y-2">
        {r.done_at ? (
          mine && <Button className="w-full" variant="outline" onClick={reopen} data-testid="reminder-reopen"><RotateCcw className="h-4 w-4" aria-hidden="true" />Mark not done</Button>
        ) : (
          (mine || canDone) && <Button className="h-12 w-full text-base" onClick={done} data-testid="reminder-done"><Check className="h-4 w-4" aria-hidden="true" />Mark done</Button>
        )}
        {mine && (
          <div className="grid grid-cols-2 gap-2">
            {!r.done_at && <Button className="h-12" variant="outline" onClick={() => setSheet("snooze")} data-testid="reminder-snooze"><AlarmClock className="h-4 w-4" aria-hidden="true" />Snooze</Button>}
            <Button className={`h-12 text-red-600 ${r.done_at ? "col-span-2" : ""}`} variant="outline" onClick={remove} data-testid="reminder-delete"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</Button>
          </div>
        )}
        {!mine && <Button className="w-full" variant="ghost" onClick={leave} data-testid="reminder-leave"><span className="text-red-600">Remove from my list</span></Button>}
      </div>

      {sheet === "snooze" && (
        <BottomSheet title="Snooze until" onClose={() => { setSheet(null); setPick(false); }} testId="snooze-sheet">
          <ul className="divide-y rounded-xl border">
            {SNOOZES.map((s) => <li key={s.id}><button type="button" className="flex min-h-12 w-full items-center px-4 text-left text-[15px] font-medium hover:bg-muted" onClick={() => snooze(snoozeTime(s.id as SnoozeChoice, new Date()))}>{s.label}</button></li>)}
            <li><button type="button" className="flex min-h-12 w-full items-center px-4 text-left text-[15px] font-medium hover:bg-muted" onClick={() => { setPick(true); setCustom(toInput(new Date(Date.now() + 3600000))); }}>Pick date and time</button></li>
          </ul>
          {pick && (
            <div className="mt-3 flex gap-2">
              <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Snooze until" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
              <Button onClick={() => { const d = new Date(custom); if (!Number.isNaN(+d)) snooze(d); }}>Snooze</Button>
            </div>
          )}
        </BottomSheet>
      )}
      {sheet === "share" && <ShareSheet reminderId={id} pro={!!lim?.who.pro} onClose={() => { setSheet(null); refreshShares(); }} onChanged={() => { refreshShares(); onChanged?.(); }} />}
    </div>
  );
}
