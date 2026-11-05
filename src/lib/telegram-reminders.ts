/**
 * Trip reminders and the admin digest. The daily job (api/cron/telegram) calls these with the service role.
 * Texts are built by pure functions so they can be tested without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, daysBetween, formatDateRange } from "@/lib/utils";
import { escapeHtml, sendToAdmins, sendToUser } from "@/lib/telegram-notify";

/** Days before the start date that a reminder goes out. */
export const REMINDER_DAYS = [7, 1] as const;

export type ReminderTrip = { id: string; user_id: string; name: string; destination: string | null; start_date: string; end_date: string | null };

export function reminderDaysFor(trip: Pick<ReminderTrip, "start_date">, today: string): number | null {
  const d = daysBetween(today, trip.start_date);
  return (REMINDER_DAYS as readonly number[]).includes(d) ? d : null;
}

export function reminderText(trip: ReminderTrip, days: number): string {
  const when = days === 1 ? "tomorrow" : `in ${days} days`;
  const where = trip.destination ? ` to ${escapeHtml(trip.destination)}` : "";
  return [
    `✈️ <b>${escapeHtml(trip.name)}</b> starts ${when}`,
    `${formatDateRange(trip.start_date, trip.end_date)}${where}`,
    "",
    days === 1 ? "Packing check: passport, cards and chargers. Send receipts here as you go." : "Time to check your travel documents. During the trip, send receipts here and I will file them.",
  ].join("\n");
}

export async function runTripReminders(supabase: SupabaseClient, today: string, now: Date = new Date()) {
  const { data: trips } = await supabase
    .from("trips")
    .select("id, user_id, name, destination, start_date, end_date")
    .eq("status", "active")
    .gte("start_date", addDaysISO(today, 1))
    .lte("start_date", addDaysISO(today, Math.max(...REMINDER_DAYS)));
  const out = { checked: 0, sent: 0, skipped: 0 };
  for (const t of (trips || []) as ReminderTrip[]) {
    const days = reminderDaysFor(t, today);
    if (days == null) continue;
    out.checked++;
    const r = await sendToUser(supabase, t.user_id, "trip_reminder", reminderText(t, days), { dedupeKey: `trip:${t.id}:${days}d`, now });
    if (r === "sent") out.sent++;
    else out.skipped++;
  }
  return out;
}

/* ---------------- admin digest ---------------- */

export type DigestStats = {
  today: string;
  newExpenses: number;
  activePeople: number;
  newPeople: number;
  openSupport: number | null;
  startingSoon: { name: string; start_date: string }[];
  activeTrips: number;
};

export function digestText(s: DigestStats): string {
  const lines = [`📊 <b>Daily summary</b> · ${s.today}`, ""];
  lines.push(`Yesterday: ${s.newExpenses} ${s.newExpenses === 1 ? "expense" : "expenses"} from ${s.activePeople} ${s.activePeople === 1 ? "person" : "people"}`);
  if (s.newPeople) lines.push(`New sign-ups: ${s.newPeople}`);
  lines.push(`Trips in progress: ${s.activeTrips}`);
  if (s.startingSoon.length) {
    lines.push("", "Starting this week:");
    for (const t of s.startingSoon.slice(0, 5)) lines.push(`• ${escapeHtml(t.name)} (${formatDateRange(t.start_date, null)})`);
    if (s.startingSoon.length > 5) lines.push(`• and ${s.startingSoon.length - 5} more`);
  }
  if (s.openSupport) lines.push("", `Open support requests: ${s.openSupport}`);
  return lines.join("\n");
}

/** Aruba has no daylight saving, so a local day is a fixed 04:00 UTC to 04:00 UTC window. */
const dayStartUtc = (date: string) => `${date}T04:00:00.000Z`;

export async function gatherDigest(supabase: SupabaseClient, today: string): Promise<DigestStats> {
  const yesterday = addDaysISO(today, -1);
  const from = dayStartUtc(yesterday);
  const to = dayStartUtc(today);
  const [exp, people, trips, soon, support] = await Promise.all([
    supabase.from("expenses").select("id, user_id").gte("created_at", from).lt("created_at", to),
    supabase.from("profiles").select("id").gte("created_at", from).lt("created_at", to),
    supabase.from("trips").select("id").eq("status", "active").lte("start_date", today),
    supabase.from("trips").select("name, start_date").eq("status", "active").gt("start_date", today).lte("start_date", addDaysISO(today, 7)).order("start_date"),
    supabase.from("support_requests").select("id").eq("status", "new"),
  ]);
  const rows = (exp.data || []) as { user_id: string }[];
  return {
    today,
    newExpenses: rows.length,
    activePeople: new Set(rows.map((r) => r.user_id)).size,
    newPeople: (people.data || []).length,
    openSupport: support.error ? null : (support.data || []).length,
    startingSoon: (soon.data || []) as { name: string; start_date: string }[],
    activeTrips: (trips.data || []).length,
  };
}

export async function runAdminDigest(supabase: SupabaseClient, today: string) {
  const stats = await gatherDigest(supabase, today);
  return sendToAdmins(supabase, digestText(stats), { dedupeKey: `digest:${today}` });
}
