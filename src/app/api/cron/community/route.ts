import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { nightlyShare } from "@/lib/community-nightly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nightly (see vercel.json): shares the latest prices of everyone who turned Community prices on, and announces new badge levels. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const r = await nightlyShare(db);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron] community nightly", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Community prices nightly share").catch(() => {});
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
