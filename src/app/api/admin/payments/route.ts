import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { logAudit } from "@/lib/audit";
import { PAYMENT_COLS } from "@/lib/payments";
import { renewedEndsOn } from "@/lib/payments";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
const MISSING = "Payments are not set up yet. Run supabase/migration_pro_payments.sql in the Supabase SQL Editor.";

/** Payments waiting for the admin, and the latest decided ones. */
export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data, error } = await ctx.admin.from("plan_payments").select(PAYMENT_COLS).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message, setupNeeded: isMissingTable(error.message) }, { status: isMissingTable(error.message) ? 200 : 500 });
  const ids = [...new Set((data ?? []).map((p) => p.user_id as string))];
  const { data: people } = ids.length ? await ctx.admin.from("profiles").select("id, email, full_name, first_name, last_name").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id as string, [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.full_name as string) || (p.email as string) || "Unknown"]));
  const rows = (data ?? []).map((p) => ({ ...p, name: who.get(p.user_id as string) ?? "Unknown" }));
  return NextResponse.json({ pending: rows.filter((r) => r.status === "pending").reverse(), history: rows.filter((r) => r.status !== "pending").slice(0, 30) });
}

/** Body: { id, action: "confirm" | "reject" }. Confirming switches Pro on (or adds time to it) and keeps the payment in the ledger. */
export async function POST(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || (body.action !== "confirm" && body.action !== "reject")) return NextResponse.json({ error: "Choose a payment." }, { status: 400 });
  const { data: pay, error: findErr } = await ctx.admin.from("plan_payments").select(PAYMENT_COLS).eq("id", id).maybeSingle();
  if (findErr) return NextResponse.json({ error: isMissingTable(findErr.message) ? MISSING : findErr.message }, { status: 500 });
  if (!pay) return NextResponse.json({ error: "That payment no longer exists." }, { status: 404 });
  if (pay.status !== "pending") return NextResponse.json({ error: "That payment was already decided." }, { status: 409 });
  const today = todayISO();
  const decided = { decided_at: new Date().toISOString(), decided_by: ctx.me.id };

  if (body.action === "reject") {
    const { error } = await ctx.admin.from("plan_payments").update({ status: "rejected", ...decided }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "payment.rejected", entityType: "user", entityId: pay.user_id, details: { amount: pay.amount, reference: pay.reference } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const { data: current } = await ctx.admin.from("user_plans").select("ends_on").eq("user_id", pay.user_id).maybeSingle();
  const endsOn = renewedEndsOn(pay.period, today, current?.ends_on ?? null);
  const { error: planErr } = await ctx.admin.from("user_plans").upsert({ user_id: pay.user_id, plan: "pro", period: pay.period, ends_on: endsOn, updated_at: new Date().toISOString(), updated_by: ctx.me.id }, { onConflict: "user_id" });
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });
  const { error } = await ctx.admin.from("plan_payments").update({ status: "confirmed", paid_on: today, ...decided }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "payment.confirmed", entityType: "user", entityId: pay.user_id, details: { amount: pay.amount, period: pay.period, endsOn, reference: pay.reference } }).catch(() => {});
  return NextResponse.json({ ok: true, endsOn });
}
