/** The daily phone reminders that need looking things up. Each returns how many people were alerted. Server only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimOnce, sendPush } from "@/lib/push";
import { clockText } from "@/lib/push-text";
import { documentTier, type ReminderDoc } from "@/lib/telegram-reminders";
import { kindLabel } from "@/lib/documents";
import { addDaysISO } from "@/lib/utils";
import { kindLabel as utilityLabel, missingKinds, monthStart } from "@/lib/personal/utilities";

const missing = (m: string) => /does not exist|schema cache/i.test(m);
const daysTo = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

type FlightRow = { id: string; trip_id: string; user_id: string; flight_number: string; dep_iata: string | null; arr_iata: string | null; dep_local: string | null; dep_est_local: string | null; flight_date: string; status: string };
const FLIGHT_SELECT = "id, trip_id, user_id, flight_number, dep_iata, arr_iata, dep_local, dep_est_local, flight_date, status";
const flightFacts = (f: FlightRow) => ({ number: f.flight_number, from: f.dep_iata, to: f.arr_iata, time: clockText(f.dep_est_local ?? f.dep_local) || null });

/** 3 days and 1 day before a trip starts: names the trip, the date and the flight that day. One alert per person (their soonest trip). */
export async function tripStartingSoon(db: SupabaseClient, today: string): Promise<number> {
  const trips = await db.from("trips").select("id, user_id, name, start_date").eq("status", "active").in("start_date", [addDaysISO(today, 1), addDaysISO(today, 3)]).order("start_date").limit(5000);
  if (trips.error) throw new Error(trips.error.message);
  const rows = (trips.data ?? []) as { id: string; user_id: string; name: string; start_date: string }[];
  if (!rows.length) return 0;
  const fl = await db.from("trip_flights").select(FLIGHT_SELECT).in("trip_id", rows.map((t) => t.id)).neq("status", "cancelled").order("dep_local");
  const flights = fl.error ? [] : ((fl.data ?? []) as FlightRow[]);
  const done = new Set<string>();
  let n = 0;
  for (const t of rows) {
    if (done.has(t.user_id)) continue;
    done.add(t.user_id);
    const f = flights.find((x) => x.trip_id === t.id && x.flight_date === t.start_date);
    await sendPush(t.user_id, "trip", "trips", { trip: t.name, days: daysTo(today, t.start_date), date: t.start_date, flight: f ? flightFacts(f) : undefined }, { today });
    n++;
  }
  return n;
}

/** The day before a flight, once per flight. */
export async function flightsTomorrow(db: SupabaseClient, today: string): Promise<number> {
  const r = await db.from("trip_flights").select(FLIGHT_SELECT).eq("flight_date", addDaysISO(today, 1)).neq("status", "cancelled").limit(2000);
  if (r.error) { if (missing(r.error.message)) return 0; throw new Error(r.error.message); }
  let n = 0;
  for (const f of (r.data ?? []) as FlightRow[]) {
    if (!(await claimOnce(f.user_id, `flight-tomorrow:${f.id}`))) continue;
    n += await sendPush(f.user_id, "flightTomorrow", "flightTomorrow", { flight: flightFacts(f) }, { today });
  }
  return n;
}

/** The day after a trip ends (or up to two days later if a run was missed), once per trip. */
export async function tripsEnded(db: SupabaseClient, today: string): Promise<number> {
  const r = await db.from("trips").select("id, user_id, name, end_date").eq("status", "active").gte("end_date", addDaysISO(today, -2)).lt("end_date", today).limit(2000);
  if (r.error) throw new Error(r.error.message);
  let n = 0;
  for (const t of (r.data ?? []) as { id: string; user_id: string; name: string }[]) {
    if (!(await claimOnce(t.user_id, `after-trip:${t.id}`))) continue;
    n += await sendPush(t.user_id, "afterTrip", "afterTrip", { trip: t.name }, { today });
  }
  return n;
}

/** Passport, visa and ID: each step (soon, urgent, expired) is sent once per expiry date. Names the kind of document, never its number. */
export async function documentsExpiring(db: SupabaseClient, today: string): Promise<number> {
  const r = await db.from("travel_documents").select("id, user_id, kind, title, expiry_date").not("expiry_date", "is", null).limit(5000);
  if (r.error) { if (missing(r.error.message)) return 0; throw new Error(r.error.message); }
  let n = 0;
  for (const d of (r.data ?? []) as ReminderDoc[]) {
    const step = documentTier(d, today);
    if (!step) continue;
    if (!(await claimOnce(d.user_id, `doc:${d.id}:${d.expiry_date}:${step.tier}`))) continue;
    n += await sendPush(d.user_id, "document", "documents", { label: kindLabel(d.kind), days: step.days, date: d.expiry_date }, { today });
  }
  return n;
}

/** On the day of the month each person chose: lists the utilities they usually pay that have no bill yet this month. Once per person per month. */
export async function utilityReminders(db: SupabaseClient, today: string): Promise<number> {
  const day = Number(today.slice(8, 10));
  const prefs = await db.from("utility_prefs").select("user_id").eq("remind_day", day).limit(5000);
  if (prefs.error) { if (missing(prefs.error.message)) return 0; throw new Error(prefs.error.message); }
  const month = monthStart(today);
  let n = 0;
  for (const p of (prefs.data ?? []) as { user_id: string }[]) {
    const bills = await db.from("utility_bills").select("kind, bill_month").eq("user_id", p.user_id).limit(2000);
    if (bills.error) { if (missing(bills.error.message)) return n; throw new Error(bills.error.message); }
    const kinds = missingKinds((bills.data ?? []) as { kind: string; bill_month: string }[], month);
    if (!kinds.length) continue;
    if (!(await claimOnce(p.user_id, `utility:${month}`))) continue;
    n += await sendPush(p.user_id, "utility", "reminders", { item: kinds.map(utilityLabel).join(", ") }, { today });
  }
  return n;
}
