import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { sendPush } from "@/lib/push";
import { FLIGHT_COLS } from "@/lib/columns";
import { changeKey, lookupPatch, needsRefresh, type TripFlight } from "@/lib/flights";
import { lookupFlight, flightLookupConfigured } from "@/lib/flights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/**
 * Daily: asks the flight service about every flight that leaves within 2 days and has alerts on, saves the newest answer,
 * and sends one phone alert per person when a flight's status, delay, gate or terminal changed since the last alert.
 * The alert text never says which flight or what changed; the person opens the app for that.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  if (!flightLookupConfigured()) return NextResponse.json({ ok: true, skipped: "flight lookup is not configured" });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const now = Date.now();
    const from = new Date(now - 2 * 86400_000).toISOString().slice(0, 10);
    const to = new Date(now + 3 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await db.from("trip_flights").select(`user_id, last_alert_key, ${FLIGHT_COLS}`).eq("alerts", true).gte("flight_date", from).lte("flight_date", to).limit(500);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, skipped: "trip_flights is not set up" });
      throw new Error(error.message);
    }
    const people = new Set<string>();
    let checked = 0;
    for (const f of (data ?? []) as unknown as (TripFlight & { user_id: string; last_alert_key: string | null })[]) {
      if (f.status === "landed" || f.status === "cancelled") continue;
      if (!needsRefresh(f, now)) continue;
      const r = await lookupFlight(f.flight_number, f.flight_date);
      checked++;
      if (!r.ok) { await db.from("trip_flights").update(lookupPatch(f, null, new Date().toISOString())).eq("id", f.id); continue; }
      const patch = lookupPatch(f, r.flight, new Date().toISOString());
      const key = changeKey({ ...f, ...patch } as TripFlight);
      const first = f.last_alert_key == null; // the first check after adding a flight (or a flight typed by hand turning live) only records the state
      await db.from("trip_flights").update({ ...patch, last_alert_key: key }).eq("id", f.id);
      if (!first && key !== f.last_alert_key) people.add(f.user_id);
    }
    for (const userId of people) await sendPush(userId, "flight", "trips");
    return NextResponse.json({ ok: true, checked, alerted: people.size });
  } catch (e) {
    console.error("[cron flights]", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Flight status refresh").catch(() => {});
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
