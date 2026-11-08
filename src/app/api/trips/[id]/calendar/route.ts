import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTripIcs, icsFileName, isReminder, type CalendarTrip } from "@/lib/trip-calendar";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The calendar file for one of the signed-in person's trips.
 * Opened in place (iPhone shows its own "Add to Calendar" screen) or, with ?download=1, saved as a file for Outlook and others.
 * ?reminder=none|1d|3d|1w  ?details=1 adds the trip's notes and a link back to it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, destination, start_date, end_date, notes, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<CalendarTrip>();
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const r = url.searchParams.get("reminder");
  const reminder = isReminder(r) ? r : "none";
  const details = url.searchParams.get("details") === "1";
  const download = url.searchParams.get("download") === "1";

  const body = buildTripIcs(trip, { reminder, details, link: `${url.origin}/trips/${trip.id}` });
  const file = icsFileName(trip.name);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
