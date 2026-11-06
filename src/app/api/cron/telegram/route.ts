import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { todayISO } from "@/lib/utils";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { pruneUpdates } from "@/lib/telegram-updates";
import { runAdminDigest, runDocumentReminders, runTripReminders } from "@/lib/telegram-reminders";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: the job does nothing until CRON_SECRET is set
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Daily job (see vercel.json): trip and document reminders to travellers, then the summary to admins. Vercel sends the CRON_SECRET. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const today = todayISO();
  try {
    const reminders = await runTripReminders(supabase, today);
    const documents = await runDocumentReminders(supabase, today);
    const digestSent = await runAdminDigest(supabase, today);
    await pruneUpdates(supabase);
    return NextResponse.json({ ok: true, today, reminders, documents, digestSent });
  } catch (e) {
    console.error("[cron] telegram", e instanceof Error ? e.message : e);
    await notifyJobFailure(supabase, "Telegram reminders");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
