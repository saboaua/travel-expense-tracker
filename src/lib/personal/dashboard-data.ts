import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRows, type DashboardProject, type DashboardRow } from "@/lib/personal/dashboard";
import { onlySpending } from "@/lib/personal/price-notes";
import { withColumnFallback } from "@/lib/columns";

/** The person's own personal expenses, grocery receipts and projects, as the spending numbers need them. Read under row-level security. */
export async function loadDashboardData(supabase: SupabaseClient, uid: string): Promise<{ rows: DashboardRow[]; projects: DashboardProject[] } | null> {
  const [ex, gr, gi, pj, cu] = await Promise.all([
    supabase.from("personal_expenses").select("project_id, merchant, amount, currency, amount_usd, category, expense_date").eq("user_id", uid).order("expense_date", { ascending: false }).limit(5000),
    withColumnFallback((cols) => supabase.from("grocery_receipts").select(cols).eq("user_id", uid).order("purchase_date", { ascending: false }).limit(5000), "id, store, purchase_date, total, currency, prices_only", "id, store, purchase_date, total, currency").then((r) => onlySpending<{ id: string; store: string; purchase_date: string; total: number; currency: string }>(r)),
    supabase.from("grocery_items").select("receipt_id, category, line_total").eq("user_id", uid).limit(20000),
    supabase.from("personal_projects").select("id, name, kind, status, destination, start_date, end_date").eq("user_id", uid),
    supabase.from("currencies").select("code, usd_rate"),
  ]);
  if (ex.error || gr.error || pj.error) return null;
  const rates: Record<string, number> = {};
  for (const c of cu.data || []) if (c.usd_rate && Number(c.usd_rate) > 0) rates[String(c.code).toUpperCase()] = Number(c.usd_rate);
  return {
    rows: buildRows(ex.data as never, gr.data, rates, gi && !gi.error ? (gi.data as never) : null),
    projects: (pj.data || []) as DashboardProject[],
  };
}
