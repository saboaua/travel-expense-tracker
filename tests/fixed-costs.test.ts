import { dueAmount, gamblingState, monthLines, nextYearly, paymentsLeft, readCost, readEntry, totalsByCategory, configuredCategories, type FixedCost } from "../src/lib/personal/fixed-costs";
import { budgetView, spentByArea, type BudgetSetting } from "../src/lib/personal/budget";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const c = (o: Partial<FixedCost> & Pick<FixedCost, "kind" | "schedule">): FixedCost => ({ amount: 0, amount2: null, currency: "AWG", day: null, due_month: null, due_month2: null, start_month: null, end_month: null, active: true, ...o });

const mortgage = c({ kind: "mortgage", schedule: "monthly", amount: 1250, start_month: "2021-04-01", end_month: "2041-03-01" });
eq("monthly inside the range", dueAmount(mortgage, "2026-11-01"), 1250);
eq("monthly before the start", dueAmount(mortgage, "2021-03-01"), 0);
eq("monthly after the end", dueAmount(mortgage, "2041-04-01"), 0);
eq("last month counts", dueAmount(mortgage, "2041-03-01"), 1250);
eq("no end date: for ever", dueAmount(c({ kind: "home_insurance", schedule: "monthly", amount: 95 }), "2099-01-01"), 95);
eq("stopped payment adds nothing", dueAmount({ ...mortgage, active: false }, "2026-11-01"), 0);

const ins = c({ kind: "car_insurance", schedule: "yearly", amount: 1020, due_month: 3, day: 15 });
eq("yearly only in its month", [dueAmount(ins, "2027-03-01"), dueAmount(ins, "2027-04-01")], [1020, 0]);
const plate = c({ kind: "license_plate", schedule: "twice_yearly", amount: 65, amount2: 65, due_month: 6, due_month2: 12, day: 30 });
eq("two plate payments", [dueAmount(plate, "2026-06-01"), dueAmount(plate, "2026-12-01"), dueAmount(plate, "2026-11-01")], [65, 65, 0]);
eq("the same month twice adds both", dueAmount({ ...plate, due_month2: 6 }, "2026-06-01"), 130);

eq("payments left count this month", paymentsLeft(mortgage, "2026-11-14"), { count: 173, total: 216250 });
eq("no end, no count", paymentsLeft(c({ kind: "mortgage", schedule: "monthly", amount: 1 }), "2026-11-14"), null);
eq("next yearly is this year", nextYearly(ins, "2026-11-14"), { date: "2027-03-15", amount: 1020 });
eq("next yearly later this year", nextYearly(plate, "2026-11-14"), { date: "2026-12-30", amount: 65 });
eq("monthly has no next yearly", nextYearly(mortgage, "2026-11-14"), null);

const card = c({ kind: "credit_card", schedule: "statement" });
const entries = [
  readEntry({ kind: "card", on_date: "2026-11-08", amount: "312.40", currency: "AWG" })!,
  readEntry({ kind: "card", on_date: "2026-10-08", amount: 287.1, currency: "AWG" })!,
  readEntry({ kind: "gambling", on_date: "2026-11-03", amount: 60, currency: "AWG" })!,
  readEntry({ kind: "gambling", on_date: "2026-11-12", amount: 40, currency: "AWG" })!,
];
const gamb = c({ kind: "gambling", schedule: "limit", amount: 200 });
const lines = monthLines([mortgage, ins, card, gamb], entries, "2026-11-01");
eq("lines: mortgage, card statement of the month, gambling", lines.map((l) => `${l.kind}:${l.amount}`), ["mortgage:1250", "credit_card:312.4", "gambling:100"]);
eq("totals by category", totalsByCategory(lines, "AWG"), { loans: 1250, insurances: 0, cards: 312.4, gambling: 100 });
eq("gambling counts without a limit", monthLines([], entries, "2026-11-01").map((l) => l.kind), ["gambling"]);
eq("configured categories", configuredCategories([mortgage, ins, gamb]), ["loans", "insurances", "gambling"]);
eq("dollars are converted", totalsByCategory([{ kind: "mortgage", category: "loans", amount: 179, currency: "USD" }], "AWG").loans, 320.41);

eq("gambling states", [gamblingState(10, 200), gamblingState(160, 200), gamblingState(235, 200), gamblingState(5, null)], ["ok", "near", "over", "none"]);

eq("bad rows are ignored", [readCost({ kind: "nope", schedule: "monthly" }), readEntry({ kind: "card", on_date: "2026-01-01", amount: 0 })], [null, null]);
eq("day is kept in 1..28", readCost({ kind: "mortgage", schedule: "monthly", amount: 1, day: 40 })?.day, 28);

// They add to the budget
const setting: BudgetSetting = { month: null, amount: 4000, currency: "AWG", limits: {}, alert_at_80: false };
const by = spentByArea({ groceries: [{ total: 506, currency: "AWG" }], utilities: [], spends: [], projects: [], fixed: lines }, "AWG");
eq("fixed areas are added by area", [by.loans, by.cards, by.gambling, by.insurances], [1250, 312.4, 100, 0]);
const v = budgetView(setting, by, "2026-11-14");
eq("spent includes the fixed costs", v.spent, 2168.4);
eq("old callers without fixed costs still work", budgetView(setting, spentByArea({ groceries: [], utilities: [], spends: [], projects: [] }, "AWG"), "2026-11-14").spent, 0);

if (fail) process.exit(1);
console.log("ok fixed-costs");
