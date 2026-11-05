/**
 * Trip reminders and the admin digest. The daily job (api/cron/telegram) calls these with the service role.
 * Texts are built by pure functions so they can be tested without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, daysBetween, formatDateRange } from "@/lib/utils";
import { escapeHtml, sendToAdmins, sendToUser } from "@/lib/telegram-notify";

/**
 * Reminders go out in two steps: about a week before (7 days, or 6 if the first chance was missed) and the day
 * before (1 day, or the start day itself if that was missed). The job runs once a day, so a reminder held back by
 * someone's quiet hours or a failed send gets one more try the next day. Each step is sent once per trip.
 */
export type ReminderTrip = { id: string; user_id: string; name: string; destination: string | null; start_date: string; end_date: string | null };

export function reminderTier(trip: Pick<ReminderTrip, "start_date">, today: string): { tier: 7 | 1; days: number } | null {
  const days = daysBetween(today, trip.start_date);
  if (days === 7 || days === 6) return { tier: 7, days };
  if (days === 1 || days === 0) return { tier: 1, days };
  return null;
}

export function reminderText(trip: ReminderTrip, days: number): string {
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const where = trip.destination ? ` to ${escapeHtml(trip.destination)}` : "";
  return [
    `✈️ <b>${escapeHtml(trip.name)}</b> starts ${when}`,
    `${formatDateRange(trip.start_date, trip.end_date)}${where}`,
    "",
    days <= 1 ? "Packing check: passport, cards and chargers. Send receipts here as you go." : "Time to check your travel documents. During the trip, send receipts here and I will file them.",
  ].join("\n");
}

export async function runTripReminders(supabase: SupabaseClient, today: string, now: Date = new Date()) {
  const { data: trips } = await supabase
    .from("trips")
    .select("id, user_id, name, destination, start_date, end_date")
    .eq("status", "active")
    .gte("start_date", today)
    .lte("start_date", addDaysISO(today, 7));
  const out = { checked: 0, sent: 0, skipped: 0 };
  for (const t of (trips || []) as ReminderTrip[]) {
    const step = reminderTier(t, today);
    if (!step) continue;
    out.checked++;
    const r = await sendToUser(supabase, t.user_id, "trip_reminder", reminderText(t, step.days), { dedupeKey: `trip:${t.id}:${step.tier}d`, now });
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

/** Reads every row of a query, 1000 at a time (the server never returns more than that in one go). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await page(from, from + 999);
    all.push(...(data || []));
    if (!data || data.length < 1000) return all;
  }
}

/** Aruba has no daylight saving, so a local day is a fixed 04:00 UTC to 04:00 UTC window. */
const dayStartUtc = (date: string) => `${date}T04:00:00.000Z`;

export async function gatherDigest(supabase: SupabaseClient, today: string): Promise<DigestStats> {
  const yesterday = addDaysISO(today, -1);
  const from = dayStartUtc(yesterday);
  const to = dayStartUtc(today);
  const exp = { data: await fetchAll((f, t) => supabase.from("expenses").select("id, user_id").gte("created_at", from).lt("created_at", to).order("id").range(f, t)) };
  const [people, trips, soon, support] = await Promise.all([
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
