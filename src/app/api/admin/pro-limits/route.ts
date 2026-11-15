import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { DEFAULT_LIMITS, LIMITS_COLS, parseLimits, readLimits, type Limits } from "@/lib/limits";

export const dynamic = "force-dynamic";
const MISSING = "Pro limits are not set up yet. Run supabase/migration_pro_limits.sql in the Supabase SQL Editor.";

export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data, error } = await ctx.admin.from("pro_limits").select(LIMITS_COLS).eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  return NextResponse.json({ limits: data ? readLimits(data as Partial<Record<keyof Limits, unknown>>) : DEFAULT_LIMITS });
}

export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const parsed = parseLimits(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { error } = await ctx.admin.from("pro_limits").upsert({ id: 1, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "pro_limits.updated", entityType: "settings", entityId: "pro_limits", details: { ...parsed.value } }).catch(() => {});
  return NextResponse.json({ ok: true, limits: parsed.value });
}
