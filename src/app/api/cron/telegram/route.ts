import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/utils";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { pruneUpdates } from "@/lib/telegram-updates";
import { getBotConfig } from "@/lib/telegram";
import { runDocumentReminders, runTripReminders } from "@/lib/telegram-reminders";
import { runAdminHealth, runUserSummaries } from "@/lib/telegram-summary";

export const dynamic = "force-dynamic";

/** Daily job (see vercel.json): trip and document reminders to travellers, then the weekly summary (Mondays) to everyone and the health summary to admins. Vercel sends the CRON_SECRET. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const today = todayISO();
  try {
    const reminders = await runTripReminders(supabase, today);
    const documents = await runDocumentReminders(supabase, today);
    const summaries = await runUserSummaries(supabase, today);
    const bot = await getBotConfig().catch(() => null);
    const healthSent = await runAdminHealth(supabase, today, { bot: { configured: !!bot, enabled: !!bot?.enabled } });
    await pruneUpdates(supabase);
    return NextResponse.json({ ok: true, today, reminders, documents, summaries, healthSent });
  } catch (e) {
    console.error("[cron] telegram", e instanceof Error ? e.message : e);
    await notifyJobFailure(supabase, "Telegram reminders");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
