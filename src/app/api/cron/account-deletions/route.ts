import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { notifyJobFailure } from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKETS = ["receipts", "loyalty-cards", "documents", "avatars"];

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Removes every file under <user id>/ in a bucket (one folder level deeper too), a page at a time. */
async function removeFiles(db: SupabaseClient, bucket: string, userId: string) {
  for (let round = 0; round < 50; round++) {
    const { data, error } = await db.storage.from(bucket).list(userId, { limit: 100 });
    if (error || !data?.length) return;
    const files = data.filter((f) => f.id).map((f) => `${userId}/${f.name}`);
    for (const folder of data.filter((f) => !f.id)) {
      const { data: inner } = await db.storage.from(bucket).list(`${userId}/${folder.name}`, { limit: 100 });
      const paths = (inner ?? []).filter((x) => x.id).map((x) => `${userId}/${folder.name}/${x.name}`);
      if (paths.length) await db.storage.from(bucket).remove(paths);
    }
    if (files.length) await db.storage.from(bucket).remove(files);
    if (!files.length || data.length < 100) return;
  }
}

/**
 * Daily: removes accounts whose 7-day waiting time is over. Files first, then the sign-in itself; every other table
 * follows by cascade. A security event records that it happened (user id only, no email).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        for (const b of BUCKETS) await removeFiles(db, b, id);
        const { error: e } = await db.auth.admin.deleteUser(id);
        if (e) throw new Error(e.message);
        await db.from("security_events").insert({ event_type: "account_deleted", severity: "info", details: { user_id: id, reason: "scheduled by the owner" } });
        removed++;
      } catch (e) {
        failed++;
        console.error("[cron] account-deletions", id, e instanceof Error ? e.message : e);
      }
    }
    if (failed > 0) await notifyJobFailure(db, "Account deletions (some could not be removed)");
    return NextResponse.json({ ok: true, removed, failed });
  } catch (e) {
    console.error("[cron] account-deletions", e instanceof Error ? e.message : e);
    await notifyJobFailure(db, "Account deletions");
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
