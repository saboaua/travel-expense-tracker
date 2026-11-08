/**
 * Trip and document reminders. The daily job (api/cron/telegram) calls these with the service role.
 * Texts are built by pure functions so they can be tested without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, daysBetween, formatDate, formatDateRange } from "@/lib/utils";
import { kindLabel } from "@/lib/documents";
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

/* ---------------- document expiry ---------------- */

export type ReminderDoc = { id: string; user_id: string; kind: string; title: string; expiry_date: string };
export type DocTier = "soon" | "urgent" | "expired";

/** Passports follow the 6-month rule, so they are flagged earlier (9 and 6 months); everything else 60 and 14 days. */
const DOC_STEPS = (kind: string) => (kind === "passport" ? { soon: 270, urgent: 180 } : { soon: 60, urgent: 14 });
/** A document that ran out long ago is not announced; only ones that expired in the last 30 days. */
const EXPIRED_WINDOW_DAYS = 30;

/** The most urgent step a document has reached, or null. Each step is sent once per expiry date. */
export function documentTier(doc: Pick<ReminderDoc, "kind" | "expiry_date">, today: string): { tier: DocTier; days: number } | null {
  const days = daysBetween(today, doc.expiry_date);
  if (days < 0) return days >= -EXPIRED_WINDOW_DAYS ? { tier: "expired", days } : null;
  const steps = DOC_STEPS(doc.kind);
  if (days <= steps.urgent) return { tier: "urgent", days };
  if (days <= steps.soon) return { tier: "soon", days };
  return null;
}

export function documentReminderText(doc: ReminderDoc, days: number): string {
  const name = escapeHtml(doc.title);
  const type = kindLabel(doc.kind).toLowerCase();
  const when = days < 0 ? `expired ${-days} ${-days === 1 ? "day" : "days"} ago` : days === 0 ? "expires today" : days < 90 ? `expires in ${days} ${days === 1 ? "day" : "days"}` : `expires in about ${Math.round(days / 30.4)} months`;
  const advice = days < 0
    ? `Your ${type} is no longer valid. Renew it before you book any travel.`
    : doc.kind === "passport"
      ? "Most destinations want a passport valid for 6+ months beyond your trip, and renewals can take weeks. Time to start the renewal."
      : "Time to renew it so it is ready before you travel.";
  return [`🛂 <b>${name}</b> ${when}`, `${kindLabel(doc.kind)} · ${formatDate(doc.expiry_date)}`, "", advice].join("\n");
}

/** Tells people when a saved document is nearing its expiry date or has just expired (general documents, not trip ones). */
export async function runDocumentReminders(supabase: SupabaseClient, today: string, now: Date = new Date()) {
  const out = { checked: 0, sent: 0, skipped: 0 };
  const { data, error } = await supabase
    .from("travel_documents")
    .select("id, user_id, kind, title, expiry_date")
    .is("trip_id", null)
    .not("expiry_date", "is", null)
    .gte("expiry_date", addDaysISO(today, -EXPIRED_WINDOW_DAYS))
    .lte("expiry_date", addDaysISO(today, 270));
  if (error) return out; // the documents table is optional; nothing to remind about
  for (const d of (data || []) as ReminderDoc[]) {
    const step = documentTier(d, today);
    if (!step) continue;
    out.checked++;
    const r = await sendToUser(supabase, d.user_id, "document_reminder", documentReminderText(d, step.days), { dedupeKey: `doc:${d.id}:${d.expiry_date}:${step.tier}`, now });
    if (r === "sent") out.sent++;
    else out.skipped++;
  }
  return out;
}
