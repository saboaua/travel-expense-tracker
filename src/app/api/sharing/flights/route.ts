import { NextResponse } from "next/server";
import { cleanSharedFlights } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Flights on trips partners shared with me: details only (never the confirmation code, seat or cabin). */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const r = await callSharing(supabase, "shared_trip_flights");
    if (r.error) return jsonError(r.error); // a database without migration 46 gives no data, so no flights
    return NextResponse.json({ flights: cleanSharedFlights(r.data) }, { headers: noStore });
  });
}
