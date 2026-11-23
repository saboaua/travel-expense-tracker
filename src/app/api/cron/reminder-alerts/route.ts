import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendReminderAlerts } from "@/lib/reminder-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Call this every 5 minutes (a Supabase schedule or any pinger, with the cron secret) so reminder alerts arrive on time. The daily job also runs it. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    return NextResponse.json({ sent: await sendReminderAlerts(db, new Date()) });
  } catch (e) {
    console.error("[cron] reminder-alerts", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
