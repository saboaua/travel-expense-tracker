import { NextResponse } from "next/server";
import { sendPush } from "@/lib/push";
import { readBadge, tierOf } from "@/lib/personal/badges";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Sends one phone alert when a new badge level was reached (the database says which level was not announced yet). */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const claimed = await supabase.rpc("claim_badge_alert");
    if (claimed.error) return NextResponse.json({ sent: 0 }, { headers: noStore }); // migration_badges.sql not run yet
    const level = Number(claimed.data) || 0;
    const t = tierOf(level);
    if (!t) return NextResponse.json({ sent: 0 }, { headers: noStore });
    const mine = readBadge((await supabase.rpc("my_badge")).data);
    const sent = await sendPush(userId, "badge", "badges", { item: t.name, count: mine.total });
    return NextResponse.json({ sent }, { headers: noStore });
  });
}
export const GET = () => jsonError("bad_action", 405);
