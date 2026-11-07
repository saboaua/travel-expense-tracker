import { NextResponse } from "next/server";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** What the profile screen, the bell and the popups need: sharing on/off, invites waiting, partners, and what I shared. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const r = await callSharing(supabase, "sharing_overview");
    if (r.error) return jsonError(r.error);
    return NextResponse.json(r.data ?? { available: false }, { headers: noStore });
  });
}
