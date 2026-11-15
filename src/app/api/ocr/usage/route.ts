import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceDb } from "@/lib/service-db";
import { scanStatusFor } from "@/lib/limits-server";

export const dynamic = "force-dynamic";

/** How many AI scans this person has used this month, for the counter on the scan screens. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = serviceDb();
  if (!db) return NextResponse.json({ limited: false });
  const st = await scanStatusFor(db, user.id).catch(() => null);
  if (!st || !st.limited) return NextResponse.json({ limited: false }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ limited: true, used: st.used, limit: st.limit, left: st.left, exhausted: st.exhausted, resetsLabel: st.resetsLabel }, { headers: { "Cache-Control": "no-store" } });
}
