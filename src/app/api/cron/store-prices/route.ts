import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { syncStorePrices } from "@/lib/store-sync";
import { notifyJobFailure } from "@/lib/telegram-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const given = req.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Daily: reads the Super Food Plaza and Ling & Sons public product lists so the price tracker can compare. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Service role key missing" }, { status: 503 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const results = await syncStorePrices(db);
  if (results.some((r) => /relation|schema cache|does not exist/i.test(r.error ?? ""))) return NextResponse.json({ ok: true, skipped: true, reason: "Run supabase/migration_store_prices.sql" });
  const failed = results.filter((r) => r.error);
  if (failed.length === results.length) await notifyJobFailure(db, "Store prices (both shops failed)").catch(() => {});
  return NextResponse.json({ ok: failed.length === 0, results });
}
