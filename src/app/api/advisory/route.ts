import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAdvisory } from "@/lib/advisory";

export const dynamic = "force-dynamic";

/**
 * Dutch travel advice for one of the signed-in user's trips. The destination is read from the trip
 * (under the user's own row-level security), never taken from the query string.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = new URL(request.url).searchParams.get("trip");
  if (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId)) return NextResponse.json({ error: "Missing trip" }, { status: 400 });

  const { data: trip } = await supabase.from("trips").select("destination").eq("id", tripId).eq("user_id", user.id).single();
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const advisory = await fetchAdvisory(trip.destination);
  return NextResponse.json(advisory, { headers: { "Cache-Control": "private, max-age=3600" } });
}
