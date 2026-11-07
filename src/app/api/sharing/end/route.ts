import { NextResponse } from "next/server";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Ends a pairing (or cancels my own pending invite). Everything shared inside it is removed. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase }) => {
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
    if (!isUuid(body?.id)) return jsonError("bad_action");
    const r = await callSharing(supabase, "end_partnership", { p_id: body.id });
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
