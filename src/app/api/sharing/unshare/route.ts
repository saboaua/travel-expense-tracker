import { NextResponse, after } from "next/server";
import { pushLookup, pushName, pushShareItem, sendPush } from "@/lib/push";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { share_id?: unknown } | null;
    if (!isUuid(body?.share_id)) return jsonError("bad_action");
    const partner = await pushLookup("push_share_partner", { p_share: body.share_id, p_me: userId });
    const what = await pushShareItem(body.share_id); // looked up now: once unshared the row is gone
    const r = await callSharing(supabase, "unshare_item", { p_share: body.share_id });
    if (r.error) return jsonError(r.error);
    after(async () => { if (partner) await sendPush(partner, "unshared", "shared", { by: await pushName(userId), item: what.item, itemKind: what.kind }); });
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
