"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dueText, filterReminders, normalizeReminder, repeatLabel, statusOf, type Reminder } from "@/lib/reminders";
import { ReminderBadge } from "./reminder-icons";
import { REMINDER_COLS } from "./RemindersList";

const SHOW = 5;

/**
 * The Personal dashboard card: the next 5 open reminders (overdue first), a tick to mark one done, + Add, and See more.
 * It is not drawn at all until there is a reminder, and stays out of the way if reminders are not set up.
 */
export function RemindersCard() {
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<Reminder[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMe(session.user.id);
      const { data, error } = await supabase.from("reminders").select(REMINDER_COLS).is("done_at", null).order("due_at", { ascending: true }).limit(200);
      setList(error ? [] : ((data ?? []) as Reminder[]).map(normalizeReminder));
      setNow(new Date());
    } catch { setList([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function tick(r: Reminder) {
    const { error } = await createClient().rpc("complete_reminder", { rid: r.id });
    if (!error) load();
  }

  if (!list || list.length === 0) return null;
  const open = filterReminders(list, "all", now);
  const shown = open.slice(0, SHOW);
  const more = open.length - shown.length;
  return (
    <section aria-label="Reminders" className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="reminders-card">
      <h2 className="text-lg font-bold">Reminders</h2>
      <ul className="mt-1 divide-y">
        {shown.map((r) => {
          const over = statusOf(r, now) === "overdue";
          const shared = me && r.user_id !== me;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2" data-testid="reminders-card-row">
              <button type="button" onClick={() => tick(r)} aria-label={`Mark ${r.title} done`} data-testid="reminders-card-tick"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-transparent hover:border-green-600 hover:text-green-600"><Check className="h-4 w-4" aria-hidden="true" /></span>
              </button>
              <Link href={`/personal/reminders/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <ReminderBadge icon={r.icon} color={r.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.title}</span>
                  <span className={`block truncate text-xs ${over ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {over ? "Overdue · " : ""}{dueText(r.snoozed_until ?? r.due_at, now)}{r.repeat !== "none" ? ` · ${repeatLabel(r)}` : ""}{shared ? " · Shared with you" : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex items-center justify-between text-sm font-semibold text-primary">
        <Link href="/personal/reminders/new" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2" data-testid="reminders-card-add"><Plus className="h-4 w-4" aria-hidden="true" />Add</Link>
        {more > 0 && <Link href="/personal/reminders" className="inline-flex min-h-11 items-center rounded-lg pl-2" data-testid="reminders-card-more">See more ({more})</Link>}
      </div>
    </section>
  );
}
