import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { notifyJobFailure } from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: the job does nothing until CRON_SECRET is set
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/**
 * Daily integrity check for partner sharing (see vercel.json). The database counts shares that should not exist
 * (no active pairing, a deleted card or trip, the wrong owner). If it finds any it switches sharing off for everyone
 * by itself and writes a critical "leak_blocked" security event; this job then tells the admins.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const { data, error } = await supabase.rpc("sharing_integrity_check");
    if (error) {
      // Sharing was never set up (migration not run): nothing to check
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, skipped: true });
      throw new Error(error.message);
    }
    // Sharing history is kept 12 months (best effort: older installs may not have it yet)
    await supabase.rpc("share_activity_purge");
    const problems = Number(data) || 0;
    if (problems > 0) await notifyJobFailure(supabase, "Sharing integrity check (sharing was switched off)");
    return NextResponse.json({ ok: true, problems });
  } catch (e) {
    console.error("[cron] sharing", e instanceof Error ? e.message : e);
    await notifyJobFailure(supabase, "Sharing integrity check");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
