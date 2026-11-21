import { cleanTypeInput, readType, STARTER_TYPES, suggestType, typeBudgetLines, typeFromHistory, spentByType, type ReceiptType } from "../src/lib/receipt-types";
import { budgetView, spentByArea, spentByTypeId, type BudgetSetting, type MonthInputs } from "../src/lib/personal/budget";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const T = (id: string, name: string, show = true, limit: number | null = null, order = 0): ReceiptType => ({ id, name, icon: "tag", color: "#112233", show_in_budget: show, monthly_limit: limit, sort_order: order });
const care = T("c", "Personal care"), health = T("h", "Health", false), pets = T("p", "Pets", false);
const types = [care, health, pets];

// starters: only Personal care has its own line
eq(STARTER_TYPES.map((t) => [t.name, t.show_in_budget]), [["Personal care", true], ["Health", false], ["Entertainment", false], ["Pets", false]], "starter types");

// reading a row
eq(readType({ id: "x", name: " Gym ", monthly_limit: "50", color: "bad", show_in_budget: null })?.color, "#475569", "bad colour falls back");
eq(readType({ id: "x", name: "Gym", monthly_limit: 0 })?.monthly_limit, null, "zero limit is no limit");
eq(readType({ id: "x", name: " " }), null, "nameless row is ignored");

// the New type form
eq(cleanTypeInput({ name: "  ", icon: "heart", color: "#e11d48", show_in_budget: true, limit: "" }, types).ok, false, "name needed");
eq(cleanTypeInput({ name: "personal CARE", icon: "heart", color: "#e11d48", show_in_budget: true, limit: "" }, types).ok, false, "same name twice is refused");
eq(cleanTypeInput({ name: "Groceries", icon: "heart", color: "#e11d48", show_in_budget: true, limit: "" }, types).ok, false, "Groceries is taken");
eq(cleanTypeInput({ name: "Care", icon: "heart", color: "#e11d48", show_in_budget: true, limit: "-3" }, types).ok, false, "limit must be above zero");
const ok = cleanTypeInput({ name: " Massage ", icon: "nope", color: "red", show_in_budget: true, limit: "40,5" }, types);
eq(ok.ok && ok.row, { name: "Massage", icon: "tag", color: "#e11d48", show_in_budget: true, monthly_limit: 40.5 }, "clean row: comma limit, unknown icon and colour replaced");
eq(cleanTypeInput({ name: "Personal care", icon: "heart", color: "#e11d48", show_in_budget: true, limit: "" }, types, "c").ok, true, "editing keeps its own name");

// the not-groceries guess
eq(suggestType("Zen Body Massage", ["Swedish massage 60 min"], types)?.id, "c", "massage points to Personal care");
eq(suggestType("Dr. Smith Clinic", [], types)?.id, "h", "clinic points to Health");
eq(suggestType("Happy Paws Vet", [], types)?.id, "p", "vet points to Pets");
eq(suggestType("Supermarket", ["Milk", "Bread"], types), null, "groceries point to nothing");
eq(suggestType("Zen Spa", [], [health]), null, "no matching type: no guess");

// same store next time
const past = [{ store: "Zen Spa", type_id: "c", area: "other" }, { store: "zen spa", type_id: "c", area: "other" }, { store: "Zen Spa", type_id: "h", area: "other" }, { store: "Zen Spa", type_id: "p", area: "groceries" }];
eq(typeFromHistory("ZEN spa", past, types)?.id, "c", "the most used type for a store");
eq(typeFromHistory("Other store", past, types), null, "unknown store");

// budget lines: own line for ON types, one row for the rest
const lines = typeBudgetLines([care, health, pets, T("e", "Gym", true, 30)], { c: 120, h: 80.5, p: 19.5 });
eq(lines.own.map((l) => [l.type.name, l.amount]), [["Gym", 0], ["Personal care", 120]], "own lines (a type with a limit shows even at zero)");
eq(lines.others, { amount: 100, names: ["Health", "Pets"] }, "others rolled into one");

// money
const conv = (a: number, c: string) => (c === "USD" ? a : c === "AWG" ? a / 1.79 : null);
eq(spentByType([{ area: "other", type_id: "c", total: 10, currency: "USD" }, { area: "other", type_id: "c", total: 17.9, currency: "AWG" }, { area: "groceries", type_id: null, total: 99, currency: "USD" }, { area: "other", type_id: null, total: 5, currency: "USD" }, { area: "other", type_id: "h", total: 5, currency: "EUR" }], conv), { c: 20 }, "typed receipts by type; others skipped");

const inp: MonthInputs = {
  groceries: [{ total: 100, currency: "USD" }, { total: 40, currency: "USD", area: "other", type_id: "c" }, { total: 10, currency: "USD", area: "other", type_id: "h" }, { total: 7, currency: "USD", area: "other", type_id: null }],
  utilities: [], spends: [], projects: [],
};
const by = spentByArea(inp, "USD");
eq(by.groceries, 107, "typed receipts are not Groceries; one with its type gone counts as Groceries");
eq(spentByTypeId(inp, "USD"), { c: 40, h: 10 }, "typed spend by type id");
const setting: BudgetSetting = { month: null, amount: 200, currency: "USD", limits: {}, alert_at_80: false };
const v = budgetView(setting, by, "2026-05-10", 0, spentByTypeId(inp, "USD"));
eq(v.spent, 157, "every type counts in the total");
eq(v.byType, { c: 40, h: 10 }, "view carries byType");
eq(budgetView(setting, by, "2026-05-10").spent, 107, "without types nothing changes");

if (failed) { console.error(`${failed} failed`); process.exit(1); }
