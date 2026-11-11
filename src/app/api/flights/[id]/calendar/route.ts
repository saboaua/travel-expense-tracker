import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FLIGHT_COLS } from "@/lib/columns";
import { buildFlightIcs, flightIcsName, isFlightReminder, type CalendarFlight } from "@/lib/flight-calendar";
import { callSharing } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The calendar file for one flight: the signed-in person's own, or one on a trip a partner shared with them.
 * Opened in place (iPhone shows its own "Add to Calendar" screen) or, with ?download=1, saved as a file.
 * ?reminder=none|3h|1d
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let flight: CalendarFlight | null = null;
  let tripId: string | null = null;
  const { data: own } = await supabase.from("trip_flights").select(FLIGHT_COLS).eq("id", id).eq("user_id", user.id).maybeSingle();
  if (own) {
    flight = own as unknown as CalendarFlight;
    tripId = (own as { trip_id: string }).trip_id;
  } else {
    const r = await callSharing(supabase, "shared_trip_flights");
    const hit = !r.error && Array.isArray(r.data) ? (r.data as (CalendarFlight & { flight_id: string; trip_id: string })[]).find((f) => f.flight_id === id) : null;
    if (hit) { flight = { ...hit, id: hit.flight_id }; tripId = hit.trip_id; }
  }
  if (!flight) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const reminder = url.searchParams.get("reminder");
  const body = buildFlightIcs(flight, { reminder: isFlightReminder(reminder) ? reminder : "none", link: own && tripId ? `${url.origin}/trips/${tripId}` : null });
  if (!body) return NextResponse.json({ error: "This flight has no departure time yet" }, { status: 422 });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${flightIcsName(flight)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
