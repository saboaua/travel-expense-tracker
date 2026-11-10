import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { FLIGHT_COLS } from "@/lib/columns";
import { needsRefresh, type TripFlight } from "@/lib/flights";
import { lookupFlight } from "@/lib/flights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Brings the signed-in person's own flights up to date (only those leaving within 2 days, and only if the last check is over 10 minutes old). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`flight-refresh:${user.id}`, 60, 3600))) return NextResponse.json({ error: "Too many checks this hour." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { tripId?: string };
  let q = supabase.from("trip_flights").select(FLIGHT_COLS).eq("user_id", user.id).eq("source", "auto");
  if (typeof body.tripId === "string") q = q.eq("trip_id", body.tripId);
  const { data, error } = await q.limit(20);
  if (error) return NextResponse.json({ error: "Could not read flights" }, { status: 500 });

  const now = Date.now();
  const due = ((data ?? []) as unknown as TripFlight[]).filter((f) => needsRefresh(f, now)).slice(0, 5);
  const updated: TripFlight[] = [];
  for (const f of due) {
    const r = await lookupFlight(f.flight_number, f.flight_date);
    // A failed check keeps what is shown; only a good answer replaces it. Details the person typed (seat, cabin, code) are never touched.
    const patch = r.ok
      ? { ...r.flight, flight_number: f.flight_number, last_synced_at: new Date().toISOString() }
      : { last_synced_at: new Date().toISOString() };
    const { data: row } = await supabase.from("trip_flights").update(patch).eq("id", f.id).eq("user_id", user.id).select(FLIGHT_COLS).single();
    if (row) updated.push(row as unknown as TripFlight);
  }
  return NextResponse.json({ flights: updated });
}
