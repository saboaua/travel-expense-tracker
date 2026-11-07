import { NextResponse } from "next/server";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase }) => {
    const body = (await request.json().catch(() => null)) as { share_id?: unknown } | null;
    if (!isUuid(body?.share_id)) return jsonError("bad_action");
    const r = await callSharing(supabase, "unshare_item", { p_share: body.share_id });
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
