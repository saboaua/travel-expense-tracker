import { fetchDashboardItems } from "../src/lib/personal/dashboard-items";
import type { SupabaseClient } from "@supabase/supabase-js";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

type Page = { data: unknown[] | null; error: { message: string } | null };
// A stand-in client: rpc() and from().select().eq().order().range() each return the pages given
const client = (rpc: Page[], direct: Page[]) => {
  const calls = { rpc: 0, direct: 0, eq: [] as string[] };
  const sb = {
    rpc: () => ({ range: () => Promise.resolve(rpc[calls.rpc++] ?? { data: [], error: null }) }),
    from: () => ({ select: () => ({ eq: (c: string, v: string) => { calls.eq.push(`${c}=${v}`); return { order: () => ({ range: () => Promise.resolve(direct[calls.direct++] ?? { data: [], error: null }) }) }; } }) }),
  } as unknown as SupabaseClient;
  return { sb, calls };
};

(async () => {
  const rolled = [{ receipt_id: "r1", category: "Dairy", line_total: 4 }];
  const a = client([{ data: rolled, error: null }], []);
  const ra = await fetchDashboardItems(a.sb, "u1");
  eq([ra.data, ra.error, a.calls.direct], [rolled, null, 0], "the database rollup is used when it exists, and the lines are not read");

  const lines = [{ receipt_id: "r1", category: "Dairy", line_total: 2 }, { receipt_id: "r1", category: "Dairy", line_total: 2 }];
  const b = client([{ data: null, error: { message: "Could not find the function public.grocery_receipt_categories in the schema cache" } }], [{ data: lines, error: null }]);
  const rb = await fetchDashboardItems(b.sb, "u1");
  eq([rb.data, rb.error, b.calls.eq], [lines, null, ["user_id=u1"]], "before the migration the lines are read for this user only");

  const c = client([{ data: null, error: { message: "permission denied for table grocery_items" } }], [{ data: lines, error: null }]);
  const rc = await fetchDashboardItems(c.sb, "u1");
  eq([rc.data, rc.error !== null, c.calls.direct], [null, true, 0], "any other error is passed on, not hidden behind the slow path");

  const d = client([{ data: null, error: { message: "Could not find the function public.grocery_receipt_categories in the schema cache" } }], [{ data: null, error: { message: "boom" } }]);
  const rd = await fetchDashboardItems(d.sb, "u1");
  eq([rd.data, rd.error !== null], [null, true], "when both ways fail the dashboard gets an error");

  process.exit(failed ? 1 : 0);
})();
