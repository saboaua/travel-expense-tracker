import { monthItemsLoaded } from "../src/lib/offline-grocery";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = got === want;
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${got} want ${want}`);
  if (!ok) failed++;
};

eq(monthItemsLoaded("2026-10", "2026-11", []), true, "this month is loaded with the overview");
eq(monthItemsLoaded("2026-10", "2026-10", []), true, "the month before is loaded with the overview");
eq(monthItemsLoaded("2026-10", "2026-07", []), false, "an older month is not loaded until it is opened");
eq(monthItemsLoaded("2026-10", "2026-07", ["2026-07"]), true, "an older month is loaded once fetched");
eq(monthItemsLoaded("2026-10", "2026-06", ["2026-07"]), false, "another older month still needs its own fetch");
eq(monthItemsLoaded(undefined, "2025-01", []), true, "a copy saved before this change holds every month");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
