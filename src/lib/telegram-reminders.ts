/**
 * Trip reminders and the admin digest. The daily job (api/cron/telegram) calls these with the service role.
 * Texts are built by pure functions so they can be tested without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, daysBetween, formatDateRange } from "@/lib/utils";
import { escapeHtml, sendToUser } from "@/lib/telegram-notify";

/**
 * Reminders go out in two steps: about a week before (7 days, or 6 if the first chance was missed) and the day
 * before (1 day, or the start day itself if that was missed). The job runs once a day, so a reminder held back by
 * someone's quiet hours or a failed send gets one more try the next day. Each step is sent once per trip.
 */
export type ReminderTrip = { id: string; user_id: string; name: string; destination: string | null; start_date: string; end_date: string | null; /** Personal travel, as opposed to a business trip */ personal?: boolean };

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
    `${trip.personal ? "🌴" : "✈️"} <b>${escapeHtml(trip.name)}</b> starts ${when}${trip.personal ? " (personal)" : ""}`,
    `${formatDateRange(trip.start_date, trip.end_date)}${where}`,
    "",
    days <= 1 ? "Packing check: passport, cards and chargers. Send receipts here as you go." : "Time to check your travel documents. During the trip, send receipts here and I will file them.",
  ].join("\n");
}

/** Business trips and personal travel are reminded the same way, each once per step. */
async function loadReminderTrips(supabase: SupabaseClient, today: string): Promise<ReminderTrip[]> {
  const to = addDaysISO(today, 7);
  const [biz, personal] = await Promise.all([
    supabase.from("trips").select("id, user_id, name, destination, start_date, end_date").eq("status", "active").gte("start_date", today).lte("start_date", to),
    // personal_projects only exists once the personal section is set up; an error just means no personal trips
    supabase.from("personal_projects").select("id, user_id, name, destination, start_date, end_date").eq("kind", "personal_trip").eq("status", "active").gte("start_date", today).lte("start_date", to),
  ]);
  return [
    ...((biz.data || []) as ReminderTrip[]),
    ...((personal.error ? [] : personal.data || []) as ReminderTrip[]).map((t) => ({ ...t, personal: true })),
  ];
}

export async function runTripReminders(supabase: SupabaseClient, today: string, now: Date = new Date()) {
  const out = { checked: 0, sent: 0, skipped: 0 };
  for (const t of await loadReminderTrips(supabase, today)) {
    const step = reminderTier(t, today);
    if (!step) continue;
    out.checked++;
    const r = await sendToUser(supabase, t.user_id, "trip_reminder", reminderText(t, step.days), { dedupeKey: `${t.personal ? "ptrip" : "trip"}:${t.id}:${step.tier}d`, now });
    if (r === "sent") out.sent++;
    else out.skipped++;
  }
  return out;
}

/* ---------------- admin digest ---------------- */

export type DigestStats = {
  today: string;
  newExpenses: number;
  newPeople: number;
  openSupport: number | null;
  startingSoon: { name: string; start_date: string }[];
  activeTrips: number;
};

/** One admin's own summary: only their trips and expenses, plus the two admin duties (sign-ups, support). */
export function digestText(s: DigestStats): string {
  const lines = [`📊 <b>Your daily summary</b> · ${s.today}`, ""];
  lines.push(`Yesterday: ${s.newExpenses} ${s.newExpenses === 1 ? "expense" : "expenses"} added`);
  lines.push(`Trips in progress: ${s.activeTrips}`);
  if (s.startingSoon.length) {
    lines.push("", "Starting this week:");
    for (const t of s.startingSoon.slice(0, 5)) lines.push(`• ${escapeHtml(t.name)} (${formatDateRange(t.start_date, null)})`);
    if (s.startingSoon.length > 5) lines.push(`• and ${s.startingSoon.length - 5} more`);
  }
  if (s.newPeople || s.openSupport) {
    lines.push("", "<b>Admin</b>");
    if (s.newPeople) lines.push(`New sign-ups: ${s.newPeople}`);
    if (s.openSupport) lines.push(`Open support requests: ${s.openSupport}`);
  }
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

export async function gatherDigest(supabase: SupabaseClient, today: string, adminId: string): Promise<DigestStats> {
  const yesterday = addDaysISO(today, -1);
  const from = dayStartUtc(yesterday);
  const to = dayStartUtc(today);
  const exp = await fetchAll((f, t) => supabase.from("expenses").select("id").eq("user_id", adminId).gte("created_at", from).lt("created_at", to).order("id").range(f, t));
  const [people, trips, soon, support] = await Promise.all([
    supabase.from("profiles").select("id").gte("created_at", from).lt("created_at", to),
    supabase.from("trips").select("id").eq("user_id", adminId).eq("status", "active").lte("start_date", today),
    supabase.from("trips").select("name, start_date").eq("user_id", adminId).eq("status", "active").gt("start_date", today).lte("start_date", addDaysISO(today, 7)).order("start_date"),
    supabase.from("support_requests").select("id").eq("status", "new"),
  ]);
  return {
    today,
    newExpenses: exp.length,
    newPeople: (people.data || []).length,
    openSupport: support.error ? null : (support.data || []).length,
    startingSoon: (soon.data || []) as { name: string; start_date: string }[],
    activeTrips: (trips.data || []).length,
  };
}

/** Every admin gets a summary of their own data, never anyone else's. */
export async function runAdminDigest(supabase: SupabaseClient, today: string) {
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").not("telegram_id", "is", null);
  let sent = 0;
  for (const a of admins || []) {
    const stats = await gatherDigest(supabase, today, a.id as string);
    if ((await sendToUser(supabase, a.id as string, "admin_alert", digestText(stats), { dedupeKey: `digest:${today}` })) === "sent") sent++;
  }
  return sent;
}
