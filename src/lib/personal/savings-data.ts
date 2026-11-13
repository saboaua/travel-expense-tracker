import type { SupabaseClient } from "@supabase/supabase-js";
import { SAVINGS_EVENT_COLS, SAVINGS_PLAN_COLS, SAVINGS_PLAN_COLS_BASE, withColumnFallback } from "@/lib/columns";
import { readEvent, readPlan, type SavingsEvent, type SavingsPlan } from "@/lib/personal/savings";

/** Your savings plans and their skipped months and extra deposits. `missing` is true when the migration has not been run yet. */
export async function fetchSavings(supabase: SupabaseClient): Promise<{ plans: SavingsPlan[]; events: SavingsEvent[]; missing: boolean; failed: boolean }> {
  const [p, e] = await Promise.all([
    withColumnFallback((cols) => supabase.from("savings_plans").select(cols).order("created_at", { ascending: true }).limit(100), SAVINGS_PLAN_COLS, SAVINGS_PLAN_COLS_BASE),
    supabase.from("savings_events").select(SAVINGS_EVENT_COLS).limit(2000),
  ]);
  const err = p.error ?? e.error;
  if (err) return { plans: [], events: [], missing: /relation|schema cache|does not exist/i.test(err.message ?? ""), failed: true };
  return {
    plans: ((p.data ?? []) as unknown as Parameters<typeof readPlan>[0][]).map(readPlan),
    events: ((e.data ?? []) as unknown as Parameters<typeof readEvent>[0][]).map(readEvent),
    missing: false, failed: false,
  };
}
