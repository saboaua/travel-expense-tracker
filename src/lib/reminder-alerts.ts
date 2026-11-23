import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { needsAlert, type Reminder } from "@/lib/reminders";

const COLS = "id, user_id, title, notes, due_at, repeat, alert, color, icon, done_at, snoozed_until, last_alerted_for, created_at";

/**
 * Sends a phone alert for every open reminder whose alert time has come (once per time), to the owner and to the people it is shared with.
 * Safe to call as often as you like: a reminder is only alerted once for the same time. Returns how many alerts went out.
 */
export async function sendReminderAlerts(db: SupabaseClient, now: Date): Promise<number> {
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const { data, error } = await db.from("reminders").select(COLS).is("done_at", null)
    .or(`snoozed_until.gte.${iso(-86400000)},and(due_at.gte.${iso(-3 * 86400000)},due_at.lte.${iso(26 * 3600000)})`).limit(2000);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  const due = ((data ?? []) as Reminder[]).filter((r) => needsAlert(r, now));
  if (!due.length) return 0;
  const shares = await db.from("reminder_shares").select("reminder_id, shared_with").in("reminder_id", due.map((r) => r.id));
  const sharedWith = new Map<string, string[]>();
  for (const s of (shares.data ?? []) as { reminder_id: string; shared_with: string }[]) sharedWith.set(s.reminder_id, [...(sharedWith.get(s.reminder_id) ?? []), s.shared_with]);
  let sent = 0;
  for (const r of due) {
    // Mark first, so two runs at once never alert twice.
    const key = r.snoozed_until ?? r.due_at;
    const mark = await db.from("reminders").update({ last_alerted_for: key }).eq("id", r.id).is("done_at", null).select("id");
    if (mark.error || !mark.data?.length) continue;
    for (const uid of [r.user_id, ...(sharedWith.get(r.id) ?? [])]) sent += await sendPush(uid, "reminder", "reminders", { item: r.title }, { now });
  }
  return sent;
}
