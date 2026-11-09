import { NextResponse } from "next/server";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Turns alerts off for one device. The delete rule only lets a person remove their own rows. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string" || body.endpoint.length > 1000) return jsonError("bad_action");
    const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", body.endpoint);
    if (error) return jsonError(null, 500);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
