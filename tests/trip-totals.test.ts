import { fetchTripTotals, totalsFromExpenses, usdOf } from "../src/lib/trip-totals";
import type { SupabaseClient } from "@supabase/supabase-js";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq(usdOf({ amount: 10, amount_usd: 11 }), 11, "the saved USD amount wins");
eq(usdOf({ amount: "10", currency: "USD" }), 10, "no USD value: an amount in USD counts as it is");
eq(usdOf({ amount: 10, currency: null }), 10, "no currency counts as USD");
eq(usdOf({ amount: 10, currency: "AWG" }), 0, "another currency without a USD value counts as nothing");
eq(usdOf({ amount: 10, amount_usd: 0, currency: "AWG" }), 0, "a saved USD value of 0 is used, not skipped");

const m = totalsFromExpenses([{ id: "a", expenses: [{ amount: 5, currency: "USD" }, { amount: 7, amount_usd: 2, currency: "AWG" }] }, { id: "b", expenses: [] }, { id: "c", expenses: null }]);
eq([m.get("a"), m.get("b"), m.get("c")], [{ total: 7, count: 2 }, { total: 0, count: 0 }, { total: 0, count: 0 }], "the old way adds each trip up");

type R = { data: unknown; error: { message: string } | null };
const client = (rpc: R, from: R) => {
  const calls = { rpc: 0, from: 0 };
  return { sb: { rpc: () => { calls.rpc++; return Promise.resolve(rpc); }, from: () => ({ select: () => ({ in: () => { calls.from++; return Promise.resolve(from); } }) }) } as unknown as SupabaseClient, calls };
};

(async () => {
  const a = client({ data: [{ trip_id: "t1", expense_count: 3, total_usd: "12.5" }], error: null }, { data: [], error: null });
  const ra = await fetchTripTotals(a.sb, ["t1", "t2"]);
  eq([ra.get("t1"), ra.get("t2"), a.calls.from], [{ total: 12.5, count: 3 }, undefined, 0], "the database totals are used and the expenses are not read");

  const b = client({ data: null, error: { message: "Could not find the function public.trip_expense_totals in the schema cache" } }, { data: [{ id: "t1", expenses: [{ amount: 4, currency: "USD" }] }], error: null });
  const rb = await fetchTripTotals(b.sb, ["t1"]);
  eq([rb.get("t1"), b.calls.from], [{ total: 4, count: 1 }, 1], "before the migration the expenses are read and added as before");

  const c = client({ data: [], error: null }, { data: [], error: null });
  eq([(await fetchTripTotals(c.sb, [])).size, c.calls.rpc], [0, 0], "no trips: nothing is asked");

  process.exit(failed ? 1 : 0);
})();
