import { NextResponse } from "next/server";
import { requireAdminService, isMissingTable } from "@/lib/admin-roles-api";
import { onProOn } from "@/lib/pro-on";
import { logAudit } from "@/lib/audit";
import { PLAN_COLS, defaultEndsOn, isIsoDate, isPeriod } from "@/lib/plans";
import { parseReceived } from "@/lib/payments";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
const MISSING = "Plans are not set up yet. Run supabase/migration_project_types_plans.sql in the Supabase SQL Editor.";

/** Everyone with their plan. */
export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const [people, plans] = await Promise.all([
    ctx.admin.from("profiles").select("id, email, full_name, first_name, last_name, role").order("email"),
    ctx.admin.from("user_plans").select(PLAN_COLS),
  ]);
  if (plans.error) return NextResponse.json({ error: isMissingTable(plans.error.message) ? MISSING : plans.error.message, setupNeeded: isMissingTable(plans.error.message) }, { status: isMissingTable(plans.error.message) ? 200 : 500 });
  if (people.error) return NextResponse.json({ error: people.error.message }, { status: 500 });
  const byUser = new Map((plans.data ?? []).map((p) => [p.user_id as string, p]));
  return NextResponse.json({
    today: todayISO(),
    people: (people.data ?? []).map((p) => ({
      id: p.id, email: p.email, role: p.role,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || p.email,
      plan: byUser.get(p.id as string) ?? null,
    })),
  });
}

/** Body: { userId, period: "monthly" | "yearly" | "gift" | "free", endsOn?: "YYYY-MM-DD", payment?: { amount, paid_on, method, reference, note } }. Free removes the plan. A payment is kept in the ledger as confirmed. */
export async function PUT(request: Request) {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: "Choose a person." }, { status: 400 });

  if (body.period === "free") {
    const { error } = await ctx.admin.from("user_plans").delete().eq("user_id", userId);
    if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
    await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "plan.removed", entityType: "user", entityId: userId, details: {} }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  if (!isPeriod(body.period)) return NextResponse.json({ error: "Choose Monthly, Yearly or Free gift." }, { status: 400 });
  const today = todayISO();
  const endsOn = body.endsOn === undefined || body.endsOn === "" ? defaultEndsOn(body.period, today) : body.endsOn === null ? null : body.endsOn;
  if (endsOn !== null && !isIsoDate(endsOn)) return NextResponse.json({ error: "The end date is not a valid date." }, { status: 400 });
  if (endsOn !== null && endsOn < today) return NextResponse.json({ error: "The end date is already past." }, { status: 400 });

  let received: ReturnType<typeof parseReceived> | null = null;
  if (body.payment) {
    if (body.period === "gift") return NextResponse.json({ error: "A free gift has no payment. Choose Monthly or Yearly." }, { status: 400 });
    received = parseReceived(body.payment, "AWG");
    if (!received.ok) return NextResponse.json({ error: received.error }, { status: 400 });
  }
  const { error } = await ctx.admin.from("user_plans").upsert({ user_id: userId, plan: "pro", period: body.period, ends_on: endsOn, updated_at: new Date().toISOString(), updated_by: ctx.me.id }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: isMissingTable(error.message) ? MISSING : error.message }, { status: 500 });
  if (received && received.ok) {
    const { data: cfg } = await ctx.admin.from("payment_settings").select("currency").eq("id", 1).maybeSingle();
    const { error: payErr } = await ctx.admin.from("plan_payments").insert({ user_id: userId, period: body.period, amount: received.value.amount, currency: cfg?.currency ?? "AWG", method: received.value.method, reference: received.value.reference, note: received.value.note, status: "confirmed", paid_on: received.value.paid_on, decided_at: new Date().toISOString(), decided_by: ctx.me.id });
    if (payErr) return NextResponse.json({ error: "Pro is on, but the payment was not saved: " + (isMissingTable(payErr.message) ? "run supabase/migration_pro_payments.sql first." : payErr.message) }, { status: 500 });
    await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "payment.recorded", entityType: "user", entityId: userId, details: { amount: received.value.amount, method: received.value.method, reference: received.value.reference } }).catch(() => {});
  }
  await logAudit({ actorId: ctx.me.id, actorEmail: ctx.me.email, action: "plan.set", entityType: "user", entityId: userId, details: { period: body.period, endsOn } }).catch(() => {});
  await onProOn(ctx.admin, userId);
  return NextResponse.json({ ok: true });
}
