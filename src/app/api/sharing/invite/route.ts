import { NextResponse, after } from "next/server";
import { pushLookup, sendPush } from "@/lib/push";
import { INVITE_SENT_MESSAGE, SHARING_LIMITS, isValidEmail, normalizeEmail } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/**
 * Sends an invite. The answer is the same for every well-formed email, whether or not it has an account,
 * so this cannot be used to find out who uses the app.
 */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true, limit: { key: "invite", max: SHARING_LIMITS.invitesPerDay, windowSec: 86_400 } }, async ({ supabase }) => {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) return jsonError("bad_email");
    const r = await callSharing(supabase, "invite_partner", { p_email: email });
    if (r.error) return jsonError(r.error);
    // Tell the invited person only if they have an account; the answer to this request stays the same either way
    after(async () => { await sendPush(await pushLookup("push_user_by_email", { p_email: email }), "invite", "invites"); });
    return NextResponse.json({ ok: true, message: INVITE_SENT_MESSAGE }, { headers: noStore });
  });
}
