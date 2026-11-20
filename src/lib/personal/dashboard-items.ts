import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/personal/fetch-all";
import type { GroceryItemRow } from "@/lib/personal/dashboard";

/**
 * What the Personal dashboard needs from the receipt lines: how much each receipt spent in each category.
 * The database adds the lines up (migration_dashboard_rollup.sql), so a long history is a few rows per receipt instead of every line.
 * Before that migration has run, the lines are read one by one as they always were, now in pages so none are cut off.
 */
export async function fetchDashboardItems(supabase: SupabaseClient, userId: string): Promise<{ data: GroceryItemRow[] | null; error: unknown }> {
  try {
    const rolled = await fetchAll<GroceryItemRow>((a, b) => supabase.rpc("grocery_receipt_categories").range(a, b) as never);
    return { data: rolled, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // Not run yet (function missing): read the lines directly. Any other problem is passed on.
    if (!/grocery_receipt_categories|schema cache|Could not find the function/i.test(message)) return { data: null, error: e };
    try {
      const lines = await fetchAll<GroceryItemRow>((a, b) => supabase.from("grocery_items").select("receipt_id, category, line_total").eq("user_id", userId).order("receipt_id").range(a, b) as never);
      return { data: lines, error: null };
    } catch (e2) {
      return { data: null, error: e2 };
    }
  }
}
