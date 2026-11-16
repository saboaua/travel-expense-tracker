import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { DEFAULT_TRIAL, TRIAL_COLS, parseTrial, readTrial } from "@/lib/pro-trial";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
const MISSING = "The free month is not set up yet. Run supabase/migration_pro_trial.sql in the Supabase SQL Editor.";

export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data, error } = await ctx.admin.from("pro_trial_settings").select(TRIAL_COLS).eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  return NextResponse.json({ trial: data ? readTrial(data) : DEFAULT_TRIAL, today: todayISO() });
}

export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const parsed = parseTrial(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { error } = await ctx.admin.from("pro_trial_settings").upsert({ id: 1, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "pro_trial.updated", entityType: "settings", entityId: "pro_trial", details: { ...parsed.value } }).catch(() => {});
  return NextResponse.json({ ok: true, trial: parsed.value, today: todayISO() });
}
