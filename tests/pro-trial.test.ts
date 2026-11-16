import { DEFAULT_TRIAL, parseTrial, readTrial, trialOpenOn, trialSummary } from "../src/lib/pro-trial";
import { defaultEndsOn, isPeriod, planCardText, planSummary, trialState } from "../src/lib/plans";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// when the free month is open
eq("always open", trialOpenOn(DEFAULT_TRIAL, "2026-11-16"), true);
eq("off is closed", trialOpenOn({ ...DEFAULT_TRIAL, mode: "off" }, "2026-11-16"), false);
const promo = { ...DEFAULT_TRIAL, mode: "dates" as const, from_date: "2026-12-01", to_date: "2026-12-31" };
eq("before the promotion", trialOpenOn(promo, "2026-11-30"), false);
eq("first day", trialOpenOn(promo, "2026-12-01"), true);
eq("last day", trialOpenOn(promo, "2026-12-31"), true);
eq("after the promotion", trialOpenOn(promo, "2027-01-01"), false);
eq("only a first day stays open", trialOpenOn({ ...promo, to_date: null }, "2030-01-01"), true);

// admin input
eq("bad mode", parseTrial({ mode: "x", days: 30 }).ok, false);
eq("days too many", parseTrial({ mode: "always", days: 400 }).ok, false);
eq("days zero", parseTrial({ mode: "always", days: 0 }).ok, false);
eq("dates need a day", parseTrial({ mode: "dates", days: 30 }).ok, false);
eq("last before first", parseTrial({ mode: "dates", days: 30, from_date: "2026-12-10", to_date: "2026-12-01" }).ok, false);
eq("dates are dropped unless used", parseTrial({ mode: "always", days: "14", from_date: "2026-12-01" }), { ok: true, value: { mode: "always", days: 14, from_date: null, to_date: null } });
eq("promo saved", parseTrial({ mode: "dates", days: 30, from_date: "2026-12-01", to_date: "2026-12-31" }), { ok: true, value: { mode: "dates", days: 30, from_date: "2026-12-01", to_date: "2026-12-31" } });
eq("off ignores leftover dates", parseTrial({ mode: "off", days: 30, from_date: "2026-12-10", to_date: "2026-12-01" }), { ok: true, value: { mode: "off", days: 30, from_date: null, to_date: null } });
eq("read defaults", readTrial(null), DEFAULT_TRIAL);
eq("read bad row", readTrial({ mode: "weird", days: "abc" }), DEFAULT_TRIAL);
eq("summary on", trialSummary(DEFAULT_TRIAL, "2026-11-16"), "On. Every new account gets 30 days of Pro.");
eq("summary off", trialSummary({ ...DEFAULT_TRIAL, mode: "off" }, "2026-11-16"), "Off. New accounts start on Free.");
eq("summary closed", trialSummary(promo, "2026-11-16"), "Closed today. Open 2026-12-01 to 2026-12-31.");

// where a person is in the month
const row = (ends_on: string, period: "trial" | "monthly" = "trial") => ({ period, ends_on });
eq("no plan", trialState(null, "2026-11-16").state, "none");
eq("paid plan is not a trial", trialState(row("2026-12-16", "monthly"), "2026-11-16").state, "none");
eq("30 days left", trialState(row("2026-12-16"), "2026-11-16"), { state: "active", daysLeft: 30, endsOn: "2026-12-16" });
eq("8 days left is still active", trialState(row("2026-11-24"), "2026-11-16").state, "active");
eq("7 days left is ending", trialState(row("2026-11-23"), "2026-11-16").state, "ending");
eq("last day is ending", trialState(row("2026-11-16"), "2026-11-16"), { state: "ending", daysLeft: 0, endsOn: "2026-11-16" });
eq("day after is ended", trialState(row("2026-11-15"), "2026-11-16").state, "ended");

// plan text
eq("trial label", planSummary({ period: "trial", ends_on: "2026-12-16" }, "2026-11-16").title, "Pro, free month");
eq("trial ends the next month by default", defaultEndsOn("trial", "2026-11-16"), "2026-12-16");
eq("an admin cannot hand out a trial", isPeriod("trial"), false);
eq("plan card ended", planCardText({ isAdmin: false, row: { period: "trial", ends_on: "2026-11-10" }, today: "2026-11-16" }).sub, "Your free month ended 2026-11-10. Get Pro to keep reports.");
eq("plan card free", planCardText({ isAdmin: false, row: null, today: "2026-11-16" }).sub, "Excel and PDF reports are a Pro feature");

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("PASS pro-trial");
