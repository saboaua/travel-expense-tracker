import { BUDGET_AREAS, budgetState, budgetView, cleanLimits, convert, daysInMonthOf, parseBudgetInput, pickBudget, readBudget, spentByArea, type BudgetSetting } from "../src/lib/personal/budget";
import { pushMessage } from "../src/lib/push-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq([convert(179, "AWG", "USD"), convert(100, "USD", "AWG"), convert(5, "AWG", "AWG")], [100, 179, 5], "AWG and USD convert at the peg");
eq(convert(10, "EUR", "AWG"), null, "another currency cannot be converted without its USD amount");
eq(convert(10, "EUR", "USD", 11), 11, "another currency uses its USD amount");

const every: BudgetSetting = { month: null, amount: 2000, currency: "AWG", limits: {}, alert_at_80: false };
const nov: BudgetSetting = { month: "2026-11-01", amount: 2500, currency: "AWG", limits: {}, alert_at_80: false };
eq([pickBudget([every, nov], "2026-11-01")?.amount, pickBudget([every, nov], "2026-12-01")?.amount, pickBudget([], "2026-11-01")], [2500, 2000, null], "a budget for one month wins over the every-month one");

eq(cleanLimits({ groceries: "700", utilities: 0, quick: "", house: -3, junk: 5 }), { groceries: 700 }, "only positive limits for known areas are kept");
eq(readBudget({ amount: "2000", currency: "EUR", limits: { house: 500 }, alert_at_80: null }), { id: undefined, month: null, amount: 2000, currency: "AWG", limits: { house: 500 }, alert_at_80: false }, "a saved row is read safely");
eq([parseBudgetInput("2000"), parseBudgetInput("350,5"), parseBudgetInput(""), parseBudgetInput("0"), parseBudgetInput("abc")], [2000, 350.5, null, null, null], "budget boxes accept a comma or a dot; empty means no limit");

const spent = spentByArea({
  groceries: [{ total: 179, currency: "AWG" }, { total: 10, currency: "USD" }],
  utilities: [{ amount_usd: 100 }],
  spends: [
    { amount: 4.5, currency: "AWG", category: "Coffee & snacks" },
    { amount: 90, currency: "AWG", category: "House" },
    { amount: 36, currency: "AWG", category: "Other", project_id: "p1" },
    { amount: 17.9, currency: "AWG", category: "Other", house_area: "Roof" },
  ],
  projects: [{ amount_usd: 10 }],
}, "AWG");
eq(spent, { groceries: 179 + 17.9, utilities: 179, quick: 4.5, house: 90 + 36 + 17.9 + 17.9 }, "each area adds up in the budget currency; house takes House spends, project and area ones, and project costs");
eq(spentByArea({ groceries: [{ total: 358, currency: "AWG" }], utilities: [], spends: [], projects: [] }, "USD").groceries, 200, "a USD budget converts AWG down");

eq([budgetState(1000, 2000), budgetState(1600, 2000), budgetState(2000, 2000), budgetState(2001, 2000)], ["ok", "near", "near", "over"], "ok under 80%, near from 80%, over only above the budget");

const v = budgetView(every, { groceries: 512, utilities: 318, quick: 164, house: 290 }, "2026-11-12");
eq([v.spent, v.left, v.over, v.state, v.daysLeft, v.perDay], [1284, 716, 0, "ok", 19, 38], "the view: spent, left, days left and about how much a day");
eq(v.pace, 11 / 30, "pace is how far through the month it is");
const o = budgetView(every, { groceries: 1000, utilities: 500, quick: 400, house: 240 }, "2026-11-30");
eq([o.spent, o.left, o.over, o.state, o.perDay], [2140, 0, 140, "over", null], "over budget: how much over, nothing a day");
eq(daysInMonthOf("2028-02-10"), 29, "leap years count");
eq(BUDGET_AREAS.map((a) => a.key), ["groceries", "utilities", "quick", "house"], "four areas");

eq(pushMessage("budget", { item: "near" }, "details").body, "You have used most of this month's budget.", "the alert says most of it is used, never an amount");
eq(pushMessage("budget", { item: "over" }, "details").body, "You are over this month's budget.", "the alert says when it is over");
eq(pushMessage("budget", { item: "over" }, "private").body, "A reminder about your monthly budget.", "private wording is generic");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("budget: all checks passed");
