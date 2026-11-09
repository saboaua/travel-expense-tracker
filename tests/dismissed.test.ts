// Run with: npx tsx tests/dismissed.test.ts
// Closed notices are kept on the account, so removing the app from the home screen does not bring them back.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanDismissed, mergeDismissed, pruneDismissed, loadDismissed, rememberDismissed, DISMISSED_STORAGE_KEY } from "../src/lib/dismissed";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const DAY = 86_400_000, now = 1_800_000_000_000;

eq(cleanDismissed({ a: 5, b: "x", c: -1, d: NaN }), { a: 5 }, "only positive numbers are kept");
eq(cleanDismissed([1, 2]), {}, "an array is not a list");
eq(cleanDismissed(null), {}, "nothing is an empty list");
eq(mergeDismissed({ a: 1, b: 9 }, { a: 5, c: 2 }), { a: 5, b: 9, c: 2 }, "the later close wins");
eq(pruneDismissed({ old: now - 8 * DAY, fresh: now - DAY }, now), { fresh: now - DAY }, "closes older than a week are dropped");

// a tiny browser + database
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
let remote: Record<string, number> | null = {};
let signedIn = true, columnMissing = false;
const fake = {
  auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: "u1" } } : null } }) },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => columnMissing ? { data: null, error: { message: "column does not exist" } } : { data: { dismissed_notices: remote }, error: null } }) }),
    update: (v: { dismissed_notices: Record<string, number> }) => ({ eq: async () => { remote = v.dismissed_notices; return { error: null }; } }),
  }),
};
// Only the few calls the code makes are faked, so the test double is cast once here
const db = fake as unknown as SupabaseClient;

(async () => {
  const t = Date.now();
  await rememberDismissed(db, "nodocs:1", t);
  eq(remote, { "nodocs:1": t }, "a close is saved on the account");
  eq(Object.keys(JSON.parse(store[DISMISSED_STORAGE_KEY])), ["nodocs:1"], "and on the device");

  // app removed from the home screen and added back: the device is empty, the account still knows
  delete store[DISMISSED_STORAGE_KEY];
  eq(await loadDismissed(db), { "nodocs:1": t }, "after a reinstall the closed notice stays closed");
  eq(Object.keys(JSON.parse(store[DISMISSED_STORAGE_KEY])), ["nodocs:1"], "and the device copy is refilled");

  // a second device closes another one: nothing is lost
  await rememberDismissed(db, "ended:2", t + 1);
  eq(Object.keys(remote!).sort(), ["ended:2", "nodocs:1"], "closes from two devices are combined");

  // offline / signed out / migration not run: the device copy still works
  signedIn = false;
  await rememberDismissed(db, "x:3", t + 2);
  eq("x:3" in JSON.parse(store[DISMISSED_STORAGE_KEY]), true, "signed out: kept on the device");
  signedIn = true; columnMissing = true;
  eq("x:3" in (await loadDismissed(db)), true, "column missing: the device copy is used");
  console.log(process.exitCode ? "FAILED" : "all dismissed tests passed");
})();
