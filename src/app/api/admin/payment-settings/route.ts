import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { EMPTY_SETTINGS, PAYMENT_SETTINGS_COLS, parseSettings } from "@/lib/payments";

export const dynamic = "force-dynamic";
const MISSING = "Payments are not set up yet. Run supabase/migration_pro_payments.sql in the Supabase SQL Editor.";

export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data, error } = await ctx.admin.from("payment_settings").select(PAYMENT_SETTINGS_COLS).eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  return NextResponse.json({ settings: data ?? EMPTY_SETTINGS });
}

export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const parsed = parseSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { error } = await ctx.admin.from("payment_settings").upsert({ id: 1, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "payment_settings.updated", entityType: "settings", entityId: "payment", details: { monthly: parsed.value.monthly_price, yearly: parsed.value.yearly_price, accounts: parsed.value.accounts.length } }).catch(() => {});
  return NextResponse.json({ ok: true, settings: parsed.value });
}
