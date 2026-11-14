import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { nightlyShare } from "@/lib/community-nightly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: the job does nothing until CRON_SECRET is set
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Nightly (see vercel.json): shares the latest prices of everyone who turned Community prices on, and announces new badge levels. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
