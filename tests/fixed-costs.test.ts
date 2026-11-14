import { paymentFallsOn, yearlyAlert, dueAmount, gamblingState, monthLines, nextYearly, paymentsLeft, readCost, readEntry, totalsByCategory, configuredCategories, cleanPlate, costName, PLATE_KINDS, INSURANCE_KINDS, type FixedCost } from "../src/lib/personal/fixed-costs";
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

// alert timing
eq("yearly: 30 days out is step 30", yearlyAlert(plate, "2026-11-30"), { step: 30, days: 30, date: "2026-12-30" });
eq("yearly: 29 days out is still step 30", yearlyAlert(plate, "2026-12-01")?.step, 30);
eq("yearly: 8 days out has no new step beyond 30", yearlyAlert(plate, "2026-12-22")?.step, 30);
eq("yearly: 7 days out is step 7", yearlyAlert(plate, "2026-12-23"), { step: 7, days: 7, date: "2026-12-30" });
eq("yearly: on the day is step 7", yearlyAlert(plate, "2026-12-30")?.step, 7);
eq("yearly: far away is quiet", yearlyAlert(plate, "2026-11-14"), null);
eq("yearly: a monthly payment is never a yearly alert", yearlyAlert(mortgage, "2026-11-14"), null);
const mort1 = { ...mortgage, day: 1 };
eq("payment day: the 1st", paymentFallsOn(mort1, "2026-12-01"), true);
eq("payment day: another day", paymentFallsOn(mort1, "2026-12-02"), false);
eq("payment day: after the end", paymentFallsOn(mort1, "2041-04-01"), false);
eq("payment day: no day set means the 1st", paymentFallsOn({ ...mortgage, day: null }, "2026-12-01"), true);
eq("payment day: yearly bills are not monthly", paymentFallsOn({ ...ins, day: 15 }, "2027-03-15"), false);

// several license plates
eq("three plate kinds", [...PLATE_KINDS], ["license_plate", "license_plate_2", "license_plate_3"]);
eq("plate numbers are tidied", [cleanPlate("  p-1234 "), cleanPlate("a   98765"), cleanPlate("   "), cleanPlate(null), cleanPlate("x".repeat(30))], ["P-1234", "A 98765", null, null, "X".repeat(16)]);
eq("plate name with a number", [costName({ kind: "license_plate", label: "P-1234" }), costName({ kind: "license_plate_2", label: "A 98765" })], ["License plate P-1234", "License plate A 98765"]);
eq("plate name without a number", [costName({ kind: "license_plate", label: null }), costName({ kind: "license_plate_2", label: null }), costName({ kind: "license_plate_3", label: "" })], ["License plate", "License plate 2", "License plate 3"]);
eq("other costs keep their name", [costName({ kind: "car_loan", label: "ignored" }), costName(undefined, "mortgage")], ["Car loan", "Home mortgage"]);
eq("lowercase for a sentence keeps the number", costName({ kind: "license_plate", label: "P-1234" }, undefined, true), "license plate P-1234");
eq("plate 2 read from a row", readCost({ kind: "license_plate_2", schedule: "yearly", amount: 100, due_month: 3, day: 5, label: " a 98765 " })?.label, "A 98765");
eq("only plates keep a label", readCost({ kind: "car_loan", schedule: "monthly", amount: 100, label: "P-1" })?.label, null);
const pl2 = c({ kind: "license_plate_2", label: "A 98765", schedule: "twice_yearly", amount: 210, amount2: 210, due_month: 3, due_month2: 9, day: 15 });
eq("plate 2 counts as an insurance in its months", [monthLines([pl2], [], "2026-03-01").map((l) => [l.kind, l.category, l.amount]), monthLines([pl2], [], "2026-04-01").length, monthLines([pl2], [], "2026-09-01").length], [[["license_plate_2", "insurances", 210]], 0, 1]);
eq("plate 2 next payment", nextYearly(pl2, "2026-04-01"), { date: "2026-09-15", amount: 210 });

// several car insurances
eq("three insurance kinds", [...INSURANCE_KINDS], ["car_insurance", "car_insurance_2", "car_insurance_3"]);
eq("insurance names", [costName({ kind: "car_insurance", label: "P-1234" }), costName({ kind: "car_insurance_2", label: null }), costName({ kind: "car_insurance_3", label: "A 98765" }, undefined, true)], ["Car insurance P-1234", "Car insurance 2", "car insurance A 98765"]);
eq("insurance 2 keeps its name from a row", readCost({ kind: "car_insurance_2", schedule: "yearly", amount: 890, due_month: 8, label: "a 98765" })?.label, "A 98765");
const in2 = c({ kind: "car_insurance_2", label: "A 98765", schedule: "yearly", amount: 890, due_month: 8, day: 1 });
eq("insurance 2 counts in its month, as an insurance", [monthLines([in2], [], "2026-08-01").map((l) => [l.kind, l.category, l.amount]), monthLines([in2], [], "2026-09-01").length], [[["car_insurance_2", "insurances", 890]], 0]);
eq("insurance 2 gets a yearly reminder", yearlyAlert(in2, "2026-07-02")?.days, 30);

if (fail) process.exit(1);
console.log("ok fixed-costs");
