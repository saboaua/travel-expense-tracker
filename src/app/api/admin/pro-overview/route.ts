import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-roles-api";
import { PLAN_COLS, proOverview, type PlanRow } from "@/lib/plans";
import { DEFAULT_LIMITS, LIMITS_COLS, readLimits } from "@/lib/limits";
import { DEFAULT_TRIAL, TRIAL_COLS, readTrial } from "@/lib/pro-trial";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** The numbers and one-line statuses on the admin Pro plan page. A part that is not set up yet shows its default. */
export async function GET() {
  const ctx = await requireAdminService();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const today = todayISO();
  const [plans, admins, pay, lim, trial] = await Promise.all([
    ctx.admin.from("user_plans").select(PLAN_COLS),
    ctx.admin.from("profiles").select("id").eq("role", "admin"),
    ctx.admin.from("plan_payments").select("id, status, method, claimed_at"),
    ctx.admin.from("pro_limits").select(LIMITS_COLS).eq("id", 1).maybeSingle(),
    ctx.admin.from("pro_trial_settings").select(TRIAL_COLS).eq("id", 1).maybeSingle(),
  ]);
  const adminIds = new Set((admins.data ?? []).map((a) => a.id as string));
  const rows = ((plans.data ?? []) as unknown as PlanRow[]).filter((p) => !adminIds.has(p.user_id));
  // a Bitcoin quote nobody has said they paid is not waiting for the admin
  const waiting = pay.error ? 0 : (pay.data ?? []).filter((p) => p.status === "pending" && !(p.method === "bitcoin" && !p.claimed_at)).length;
  return NextResponse.json({
    today,
    ...proOverview(rows, today),
    waiting,
    limits: lim.data ? readLimits(lim.data as unknown as Record<string, unknown>) : DEFAULT_LIMITS,
    trial: trial.data ? readTrial(trial.data) : DEFAULT_TRIAL,
  });
}
