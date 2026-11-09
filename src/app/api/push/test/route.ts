import { NextResponse } from "next/server";
import { pushConfigured, sendPush } from "@/lib/push";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withSharingUser(request, { write: true, limit: { key: "pushtest", max: 10, windowSec: 3600 } }, async ({ userId }) => {
    if (!pushConfigured()) return jsonError(null, 503);
    const sent = await sendPush(userId, "test", null);
    return NextResponse.json({ ok: true, sent }, { headers: noStore });
  });
}
