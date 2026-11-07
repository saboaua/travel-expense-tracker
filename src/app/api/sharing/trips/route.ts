import { NextResponse } from "next/server";
import { cleanSharedTrips } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Trips partners shared with me: name, destination and dates only. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const r = await callSharing(supabase, "shared_trips");
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ trips: cleanSharedTrips(r.data) }, { headers: noStore });
  });
}
