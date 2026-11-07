import { NextResponse } from "next/server";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase }) => {
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") return jsonError("bad_action");
    const r = await callSharing(supabase, "set_sharing", { p_enabled: body.enabled });
    if (r.error) return jsonError(r.error);
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
