import { depositDate, deposits, isPaused, monthlyTotals, pausedToday, readPauses, resumedToday, savingsSummary, monthSavings, plannedDeposits, progressPct, remaining, ruleText, savedSoFar, type SavingsEvent, type SavingsPlan } from "../src/lib/personal/savings";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const today = "2026-11-12";
const plan: SavingsPlan = { id: "p1", name: "Emergency fund", amount: 200, currency: "AWG", start_date: "2026-10-01", end_date: "2027-12-01", opening_balance: 3100, goal: 10000, pauses: [] };
const none: SavingsEvent[] = [];

eq([depositDate({ ...plan, start_date: "2026-01-31" }, "2027-02-01"), depositDate({ ...plan, start_date: "2026-01-31" }, "2028-02-01"), depositDate(plan, "2026-12-01")], ["2027-02-28", "2028-02-29", "2026-12-01"], "a deposit on the 31st falls on the last day of a short month");

eq(deposits(plan, none, today).map((d) => [d.date, d.status]), [["2026-12-01", "coming"], ["2026-11-01", "counted"], ["2026-10-01", "counted"]], "deposits so far plus the next one, newest first");
eq(savedSoFar(plan, none, today), 3500, "saved so far is what you had plus the deposits that have passed");
eq(remaining(plan, none, today), { count: 13, endsAt: 6100 }, "13 deposits to go, ending at 6,100");
eq(plannedDeposits("2026-10-01", "2027-12-01", 200), { count: 15, total: 3000 }, "the add form shows how many deposits and the total");

const skip: SavingsEvent[] = [{ plan_id: "p1", kind: "skip", month: "2026-11-01", amount: null }];
eq([savedSoFar(plan, skip, today), deposits(plan, skip, today).find((d) => d.month === "2026-11-01")?.status], [3300, "skipped"], "a skipped month is left out of the total");
eq([monthSavings([plan], skip, "2026-11-01"), monthSavings([plan], skip, "2026-12-01")], [[], [{ amount: 200, currency: "AWG" }]], "a skipped month adds nothing to the budget, the next one does");

const extra: SavingsEvent[] = [{ plan_id: "p1", kind: "extra", month: "2026-11-01", amount: 50 }];
eq([savedSoFar(plan, extra, today), monthSavings([plan], extra, "2026-11-01")], [3550, [{ amount: 200, currency: "AWG" }, { amount: 50, currency: "AWG" }]], "an extra deposit counts in the total and in its month's budget");
eq(deposits(plan, extra, today).filter((d) => d.status === "extra").length, 1, "extras are listed");

const open: SavingsPlan = { ...plan, id: "p2", start_date: "2026-01-15", end_date: null, opening_balance: 0, amount: 100, goal: null };
eq([savedSoFar(open, none, today), remaining(open, none, today), deposits(open, none, today)[0].status], [1000, null, "coming"], "a plan with no end: ten deposits so far, nothing to count down");
eq(monthSavings([open], none, "2026-11-01"), [{ amount: 100, currency: "AWG" }], "this month's deposit counts in the budget even before its day");
eq(monthSavings([open], none, "2025-12-01"), [], "months before the plan started add nothing");

const paused: SavingsPlan = { ...plan, pauses: [{ from: "2026-11-01", to: null }] };
eq([savedSoFar(paused, none, today), monthSavings([paused], none, "2026-11-01"), remaining(paused, none, today)?.count], [3300, [], 0], "a paused plan stops depositing from the pause date");

// resuming does not back-fill the months it was paused
const stopped: SavingsPlan = { ...open, id: "p3", start_date: "2026-01-15", pauses: [{ from: "2026-04-10", to: "2026-07-10" }] };
eq([savedSoFar(stopped, none, today), monthSavings([stopped], none, "2026-05-01"), monthSavings([stopped], none, "2026-07-01")], [700, [], [{ amount: 100, currency: "AWG" }]], "months paused and then resumed stay empty: Apr 15 to Jul 9 deposits are missing, Jul 15 on come back");
eq([isPaused(paused), isPaused(stopped)], [true, false], "paused means an open pause");
eq([pausedToday(stopped, today).length, resumedToday(paused, "2026-11-12")[0].to, pausedToday(paused, today).length], [2, "2026-11-12", 1], "pausing adds a period, resuming closes the open one");
eq(readPauses(null, "2026-03-01"), [{ from: "2026-03-01", to: null }], "a plan paused before periods existed keeps its pause");
eq(savingsSummary([plan, { ...paused, id: "p9", currency: "USD", amount: 100, opening_balance: 50 }], none, today), { currency: "AWG", saved: 3768.5, monthly: 200, plans: 2 }, "one summary for the hub and the page: other currencies converted (50 + one 100 deposit in USD), a paused plan adds no monthly amount");
eq(monthlyTotals([plan], none, today, "AWG").map((m) => m.total), [3100, 3100, 3100, 3100, 3300, 3500], "the chart: the total at the end of each month");
eq(monthlyTotals([plan], none, today, "USD", 1)[0].total, Math.round((3500 / 1.79) * 100) / 100, "the chart converts to the chosen currency");

eq([progressPct(3500, 10000), progressPct(12000, 10000), progressPct(500, null)], [35, 100, null], "progress to the goal, never above 100");
eq([ruleText(plan), ruleText(open)], ["Every month until Dec 2027", "Every month, no end date"], "the rule in words");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("savings: all checks passed");
