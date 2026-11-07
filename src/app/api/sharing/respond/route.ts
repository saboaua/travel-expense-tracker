import { NextResponse } from "next/server";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase }) => {
    const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
    if (!isUuid(body?.id) || (body?.action !== "accept" && body?.action !== "decline" && body?.action !== "block")) return jsonError("bad_action");
    const r = await callSharing(supabase, "respond_to_invite", { p_id: body.id, p_action: body.action });
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
