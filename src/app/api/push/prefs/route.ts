import { NextResponse } from "next/server";
import { normalizePushSettings, parsePushPatch } from "@/lib/push-prefs";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase, userId }) => {
    const { data } = await supabase.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
    return NextResponse.json({ prefs: normalizePushSettings(data?.push_prefs) }, { headers: noStore });
  });
}

/** Saves a change to what you are alerted about (any of the switches, the message style, quiet hours). What the change leaves out keeps its saved value. */
export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { prefs?: unknown } | null;
    const patch = parsePushPatch(body?.prefs);
    if (!patch) return jsonError("bad_action");
    const { data: saved } = await supabase.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
    const prefs = { ...normalizePushSettings(saved?.push_prefs), ...patch };
    const { error } = await supabase.from("profiles").update({ push_prefs: prefs }).eq("id", userId);
    if (error) return jsonError(null, 500);
    return NextResponse.json({ ok: true, prefs }, { headers: noStore });
  });
}
