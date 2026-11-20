import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { notifyJobFailure } from "@/lib/telegram-alerts";
import { PAPER_BUCKET, dueEndDate } from "@/lib/trip-papers";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: removes the trip papers of trips that ended a week ago or more. The files go first, then the rows, so a failed file leaves the row to try again tomorrow. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const { data: trips, error } = await db.from("trips").select("id").not("end_date", "is", null).lte("end_date", dueEndDate(todayISO())).limit(2000);
    if (error) throw new Error(error.message);
    const ids = (trips ?? []).map((t) => t.id as string);
    let removed = 0, failed = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data: papers, error: pe } = await db.from("trip_papers").select("id, file_path").in("trip_id", chunk).limit(5000);
      if (pe) {
        if (/does not exist|schema cache/i.test(pe.message)) return NextResponse.json({ ok: true, skipped: true });
        throw new Error(pe.message);
      }
      for (const p of papers ?? []) {
        try {
          if (p.file_path) {
            const { error: fe } = await db.storage.from(PAPER_BUCKET).remove([p.file_path as string]);
            if (fe) throw new Error(fe.message);
          }
          const { error: de } = await db.from("trip_papers").delete().eq("id", p.id);
          if (de) throw new Error(de.message);
          removed++;
        } catch (e) {
          failed++;
          console.error("[cron] trip-papers", p.id, e instanceof Error ? e.message : e);
        }
      }
    }
    if (failed > 0) await notifyJobFailure(db, "Trip papers (some could not be removed)");
    return NextResponse.json({ ok: true, removed, failed });
  } catch (e) {
    console.error("[cron] trip-papers", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Trip papers").catch(() => {});
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
