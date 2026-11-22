import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { removeAllUserFiles } from "@/lib/account-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: removes accounts whose 7-day waiting time is over. Files first, then the sign-in itself; every other table
 * follows by cascade. A security event records that it happened (user id only, no email).
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const { data, error } = await db.rpc("account_deletions_due");
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, skipped: true });
      throw new Error(error.message);
    }
    const due = (Array.isArray(data) ? data : []) as ({ user_id: string } | string)[];
    let removed = 0;
    let failed = 0;
    for (const row of due) {
      const id = typeof row === "string" ? row : row.user_id;
      try {
        await removeAllUserFiles(db, id);
        // The prices this person shared with the community stay: they hold only store, item and price, and nothing that points back to the person.
        const { error: e } = await db.auth.admin.deleteUser(id);
        if (e) throw new Error(e.message);
        await db.from("security_events").insert({ event_type: "account_deleted", severity: "info", details: { user_id: id, reason: "scheduled by the owner" } });
        removed++;
      } catch (e) {
        failed++;
        console.error("[cron] account-deletions", id, e instanceof Error ? e.message : e);
      }
    }
    // Saved trip places are deleted the day after the trip ends (harmless when the table is not there yet)
    await db.rpc("purge_trip_places").then(() => null, () => null);
    // Shared prices keep the exact time for 2 days only (for the daily limit and Undo), then only the month remains
    await db.rpc("wipe_share_times").then(() => null, () => null);
    if (failed > 0) await notifyJobFailure(db, "Account deletions (some could not be removed)");
    return NextResponse.json({ ok: true, removed, failed });
  } catch (e) {
    console.error("[cron] account-deletions", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Account deletions");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
