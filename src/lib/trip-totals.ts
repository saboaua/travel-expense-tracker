import type { SupabaseClient } from "@supabase/supabase-js";

export type TripTotal = { total: number; count: number };
type Expense = { amount: number | string; amount_usd?: number | string | null; currency?: string | null };

/** USD value of one expense: the saved USD amount, else the amount itself when it is in USD, else nothing. */
export function usdOf(e: Expense): number {
  if (e.amount_usd != null) return Number(e.amount_usd);
  if (!e.currency || e.currency === "USD") return Number(e.amount);
  return 0;
}

/** Totals from the old way: every expense row of each trip. */
export function totalsFromExpenses(trips: { id: string; expenses?: Expense[] | null }[]): Map<string, TripTotal> {
  const out = new Map<string, TripTotal>();
  for (const t of trips) out.set(t.id, { total: (t.expenses ?? []).reduce((s, e) => s + usdOf(e), 0), count: (t.expenses ?? []).length });
  return out;
}

/**
 * How much each trip has spent (USD) and how many expenses it has. The database adds them up (migration_trip_totals.sql);
 * until that has run, the expenses are read and added here as before. A trip with no expenses is simply missing from the map.
 */
export async function fetchTripTotals(supabase: SupabaseClient, tripIds: string[]): Promise<Map<string, TripTotal>> {
  if (!tripIds.length) return new Map();
  const r = await supabase.rpc("trip_expense_totals");
  if (!r.error && Array.isArray(r.data)) {
    const out = new Map<string, TripTotal>();
    for (const x of r.data as { trip_id: string; expense_count: number | string; total_usd: number | string | null }[]) out.set(x.trip_id, { total: Number(x.total_usd ?? 0), count: Number(x.expense_count ?? 0) });
    return out;
  }
  const old = await supabase.from("trips").select("id, expenses(amount, amount_usd, currency)").in("id", tripIds);
  return totalsFromExpenses(((old.data ?? []) as unknown as { id: string; expenses: Expense[] | null }[]));
}
