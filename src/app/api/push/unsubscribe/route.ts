import { NextResponse } from "next/server";
import { normalizePushSettings } from "@/lib/push-prefs";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** Turns alerts off for one device. The delete rule only lets a person remove their own rows. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown; keepWanted?: unknown } | null;
    if (typeof body?.endpoint !== "string" || body.endpoint.length > 1000) return jsonError("bad_action");
    const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", body.endpoint);
    if (error) return jsonError(null, 500);
    // Turning alerts off on your last device means you no longer want them; signing out keeps the wish
    if (body.keepWanted !== true) {
      const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (!count) {
        const { data: saved } = await supabase.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
        await supabase.from("profiles").update({ push_prefs: { ...normalizePushSettings(saved?.push_prefs), wanted: false } }).eq("id", userId);
      }
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  });
}
