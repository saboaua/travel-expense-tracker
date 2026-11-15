import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_COLS, isProActive } from "@/lib/plans";
import { todayISO } from "@/lib/utils";

/** True for an admin, or for anyone whose Pro plan is switched on today. A missing table (migration not run) means free. */
export async function hasPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role === "admin") return true;
  const { data, error } = await supabase.from("user_plans").select(PLAN_COLS).eq("user_id", userId).maybeSingle();
  if (error) return false;
  return isProActive(data as { plan: "pro"; ends_on: string | null } | null, todayISO());
}
