import { NextResponse, after } from "next/server";
import { SHARE_KINDS, isUuid, type ShareKind } from "@/lib/sharing";
import { pushItemTitle, pushLookup, pushName, sendPush } from "@/lib/push";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** A partner opened something shared with them. The database only records it if the share is live, and once an hour per item. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true, limit: { key: "view", max: 300, windowSec: 3600 } }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { kind?: unknown; item_id?: unknown } | null;
    if (!isUuid(body?.item_id) || !SHARE_KINDS.includes(body?.kind as ShareKind)) return jsonError("bad_action");
    const r = await callSharing(supabase, "log_share_view", { p_kind: body.kind, p_item: body.item_id });
    if (r.error) return jsonError(r.error);
    if (r.data === true) {
      const { kind, item_id } = body as { kind: string; item_id: string };
      after(async () => {
        const owner = await pushLookup("push_view_owner", { p_viewer: userId, p_kind: kind, p_item: item_id });
        if (owner) await sendPush(owner, "view", "views", { by: await pushName(userId), item: await pushItemTitle(kind, item_id), itemKind: kind });
      });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
