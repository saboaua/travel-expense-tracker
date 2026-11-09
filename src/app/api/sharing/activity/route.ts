import { NextResponse } from "next/server";
import { isUuid } from "@/lib/sharing";
import { callSharing, jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** My sharing history: who looked at what I shared, and every change. Only my own rows are ever returned. */
export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase }) => {
    const u = new URL(request.url);
    const filter = u.searchParams.get("filter") || "all";
    const partner = u.searchParams.get("partner");
    const before = u.searchParams.get("before");
    if (!["all", "views", "changes"].includes(filter) || (partner && !isUuid(partner)) || (before && Number.isNaN(Date.parse(before)))) return jsonError("bad_action");
    const r = await callSharing(supabase, "sharing_activity", { p_filter: filter, p_partner: partner || null, p_before: before || null, p_limit: 30 });
    if (r.error) return jsonError(r.error);
    return NextResponse.json(r.data, { headers: noStore });
  });
}
