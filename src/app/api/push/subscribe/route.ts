import { NextResponse } from "next/server";
import { serviceClient, validSubscription } from "@/lib/push";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Is this phone's subscription saved for the signed-in person? Lets the app notice a row that went missing. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase, userId }) => {
    const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
    if (!endpoint || endpoint.length > 1000) return jsonError("bad_action");
    const { data, error } = await supabase.from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", endpoint).limit(1);
    if (error) return jsonError(null, 500);
    return NextResponse.json({ registered: (data ?? []).length > 0 }, { headers: noStore });
  });
}

/** Saves this device for the signed-in person. A device that was used by someone else before is taken over. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true, limit: { key: "push", max: 30, windowSec: 3600 } }, async ({ userId }) => {
    const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
    if (!validSubscription(body?.subscription)) return jsonError("bad_action");
    const db = serviceClient();
    if (!db) return jsonError(null, 503);
    const sub = body.subscription;
    const { error } = await db.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: (request.headers.get("user-agent") || "").slice(0, 200) },
      { onConflict: "endpoint" },
    );
    if (error) return jsonError(null, 500);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
