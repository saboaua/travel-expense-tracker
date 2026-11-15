/** Server side of the Pro limits: read them, find out who is Pro, count AI scans. Missing tables (migration not run) mean no limits. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LIMITS, LIMITS_COLS, featureLocked, monthKey, readLimits, scanStatus, type Limits, type ProFeature, type ScanStatus, type Who } from "@/lib/limits";
import { PLAN_COLS, isProActive } from "@/lib/plans";
import { todayISO } from "@/lib/utils";

export async function loadLimits(db: SupabaseClient): Promise<Limits> {
  const { data, error } = await db.from("pro_limits").select(LIMITS_COLS).eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_LIMITS;
  return readLimits(data as Partial<Record<keyof Limits, unknown>>);
}

export async function whoIs(db: SupabaseClient, userId: string): Promise<Who> {
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role === "admin") return { pro: true, admin: true };
  const { data, error } = await db.from("user_plans").select(PLAN_COLS).eq("user_id", userId).maybeSingle();
  if (error) return { pro: false, admin: false };
  return { pro: isProActive(data as { plan: "pro"; ends_on: string | null } | null, todayISO()), admin: false };
}

/** True when this person is held back from the feature today. */
export async function isLocked(db: SupabaseClient, userId: string, feature: ProFeature, today = todayISO()): Promise<boolean> {
  const limits = await loadLimits(db);
  if (!limits.starts_on) return false;
  return featureLocked(limits, await whoIs(db, userId), feature, today);
}

export async function aiScansUsed(db: SupabaseClient, userId: string, today = todayISO()): Promise<number> {
  const { data, error } = await db.from("ai_scan_usage").select("count").eq("user_id", userId).eq("month", monthKey(today)).maybeSingle();
  return error ? 0 : Number(data?.count) || 0;
}

export async function countAiScan(db: SupabaseClient, userId: string, today = todayISO()): Promise<void> {
  const used = await aiScansUsed(db, userId, today);
  await db.from("ai_scan_usage").upsert({ user_id: userId, month: monthKey(today), count: used + 1 }, { onConflict: "user_id,month" });
}

export async function scanStatusFor(db: SupabaseClient, userId: string, today = todayISO()): Promise<ScanStatus & { who: Who }> {
  const [limits, who, used] = await Promise.all([loadLimits(db), whoIs(db, userId), aiScansUsed(db, userId, today)]);
  return { ...scanStatus(limits, who, used, today), who };
}
