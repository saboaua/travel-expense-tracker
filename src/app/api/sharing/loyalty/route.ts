import { NextResponse } from "next/server";
import { cleanSharedCards } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Cards partners shared with me. View only: there is no route that changes a shared card. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const r = await callSharing(supabase, "shared_loyalty_cards");
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ cards: cleanSharedCards(r.data) }, { headers: noStore });
  });
}
