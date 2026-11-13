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
  // Anything that went wrong is written to the log, and any shop that saved nothing raises an alert (not only when both fail)
  for (const r of results) if (r.error || r.problem) console.error(`[cron] store prices ${r.store}: ${r.error ?? r.problem}`);
  if (failed.length > 0) await notifyJobFailure(db, `Store prices (${failed.map((r) => r.store).join(", ")} saved nothing)`).catch(() => {});
  return NextResponse.json({ ok: failed.length === 0, results });
}
