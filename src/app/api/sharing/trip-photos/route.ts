import { NextResponse } from "next/server";
import { cleanSharedTrips } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";
import { getDestinationInfo } from "@/lib/destination";

export const dynamic = "force-dynamic";

/** A destination photo for each trip shared with me. Derived only from the destination the partner already shares; no other trip data. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const r = await callSharing(supabase, "shared_trips");
    if (r.error) return jsonError(r.error);
    const trips = cleanSharedTrips(r.data);
    const photos: Record<string, string | null> = {};
    await Promise.all(
      trips.map(async (t) => {
        photos[t.trip_id] = t.destination ? ((await getDestinationInfo(t.destination).catch(() => null))?.imageUrl ?? null) : null;
      }),
    );
    return NextResponse.json({ photos }, { headers: noStore });
  });
}
