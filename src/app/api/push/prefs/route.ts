import { NextResponse } from "next/server";
import { DEFAULT_PUSH_PREFS, type PushPrefs } from "@/lib/push";
import { jsonError, noStore, withSharingUser } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withSharingUser(request, {}, async ({ supabase, userId }) => {
    const { data } = await supabase.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
    return NextResponse.json({ prefs: { ...DEFAULT_PUSH_PREFS, ...((data?.push_prefs as Partial<PushPrefs> | null) ?? {}) } }, { headers: noStore });
  });
}

export async function POST(request: Request) {
  return withSharingUser(request, { write: true }, async ({ supabase, userId }) => {
    const body = (await request.json().catch(() => null)) as { prefs?: Partial<PushPrefs> } | null;
    const p = body?.prefs;
    if (!p || (["invites", "shared", "views"] as const).some((k) => typeof p[k] !== "boolean")) return jsonError("bad_action");
    // The newer switches are optional so an older open page can still save the first three; what it leaves out keeps its saved value
    for (const k of ["reminders", "trips", "support"] as const) if (p[k] !== undefined && typeof p[k] !== "boolean") return jsonError("bad_action");
    const { data: saved } = await supabase.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
    const before = { ...DEFAULT_PUSH_PREFS, ...((saved?.push_prefs as Partial<PushPrefs> | null) ?? {}) };
    const prefs = { invites: p.invites, shared: p.shared, views: p.views, reminders: p.reminders ?? before.reminders, trips: p.trips ?? before.trips, support: p.support ?? before.support };
    const { error } = await supabase.from("profiles").update({ push_prefs: prefs }).eq("id", userId);
    if (error) return jsonError(null, 500);
    return NextResponse.json({ ok: true, prefs }, { headers: noStore });
  });
}
