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

/** Every file path under a folder, however deep (folders have no id in a listing), a page at a time. */
async function listFiles(db: SupabaseClient, bucket: string, folder: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (let offset = 0; offset < 100000; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error || !data?.length) break;
    for (const f of data) {
      if (f.id) out.push(`${folder}/${f.name}`);
      else out.push(...(await listFiles(db, bucket, `${folder}/${f.name}`, depth + 1)));
    }
    if (data.length < 100) break;
  }
  return out;
}

/** Removes every file under <user id>/ in a bucket, in any depth of folders (photos sit in personal/spends/, personal/utilities/ and so on). */
async function removeFiles(db: SupabaseClient, bucket: string, userId: string) {
  const paths = await listFiles(db, bucket, userId);
  for (let i = 0; i < paths.length; i += 100) await db.storage.from(bucket).remove(paths.slice(i, i + 100));
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
        try { await db.rpc("unshare_prices_of", { uid: id }); } catch { /* community prices are not set up on this install */ }
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
