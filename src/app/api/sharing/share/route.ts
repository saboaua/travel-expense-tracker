import { NextResponse, after } from "next/server";
import { pushItemTitle, pushLookup, pushName, sendPush } from "@/lib/push";
import { SHARE_KINDS, isUuid, type ShareKind } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Shares one card or one trip with one approved partner. Nothing is ever shared by default. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { partnership_id?: unknown; kind?: unknown; item_id?: unknown } | null;
    if (!isUuid(body?.partnership_id) || !isUuid(body?.item_id) || !SHARE_KINDS.includes(body?.kind as ShareKind)) return jsonError("bad_action");
    const r = await callSharing(supabase, "share_item", { p_partnership: body.partnership_id, p_kind: body.kind, p_item: body.item_id });
    if (r.error) return jsonError(r.error);
    const pid = body.partnership_id as string;
    const kind = body.kind as string;
    const itemId = body.item_id as string;
    after(async () => {
      const to = await pushLookup("push_other_party", { p_partnership: pid, p_me: userId });
      if (to) await sendPush(to, "shared", "shared", { by: await pushName(userId), item: await pushItemTitle(kind, itemId), itemKind: kind });
    });
    return NextResponse.json({ ok: true, share_id: r.data }, { headers: noStore });
  });
}
