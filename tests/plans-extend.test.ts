import { defaultEndsOn, extendedEndsOn, shortensPlan } from "../src/lib/plans";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const today = "2026-11-17";
const run = (ends_on: string | null) => ({ plan: "pro" as const, ends_on });

// Adding time goes on top of what a person still has
eq("no plan: from today", extendedEndsOn("monthly", today, null), defaultEndsOn("monthly", today));
eq("running plan: monthly is added to its end", extendedEndsOn("monthly", today, run("2026-12-10")), defaultEndsOn("monthly", "2026-12-10"));
eq("running plan: yearly is added to its end", extendedEndsOn("yearly", today, run("2027-03-01")), defaultEndsOn("yearly", "2027-03-01"));
eq("ended plan: from today", extendedEndsOn("monthly", today, run("2026-10-01")), defaultEndsOn("monthly", today));
eq("no end date: counts from today", extendedEndsOn("monthly", today, run(null)), defaultEndsOn("monthly", today));
eq("gift has no end", extendedEndsOn("gift", today, run("2026-12-10")), null);

// A running plan is never cut short by accident
eq("earlier end date shortens", shortensPlan(run("2027-01-01"), "2026-12-01", today), true);
eq("later end date does not", shortensPlan(run("2026-12-01"), "2027-01-01", today), false);
eq("same end date does not", shortensPlan(run("2026-12-01"), "2026-12-01", today), false);
eq("no end date to a date shortens", shortensPlan(run(null), "2027-01-01", today), true);
eq("a date to no end date does not", shortensPlan(run("2027-01-01"), null, today), false);
eq("nobody on a plan: nothing to shorten", shortensPlan(null, "2026-12-01", today), false);
eq("an ended plan: nothing to shorten", shortensPlan(run("2026-10-01"), "2026-12-01", today), false);

if (fail) process.exit(1);
console.log("plans extend: ok");
