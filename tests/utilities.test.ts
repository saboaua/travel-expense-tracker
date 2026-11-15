import { toAwg, defaultBillMonth, dueBills, history, kindLabel, lastProvider, missingKinds, monthChange, monthLabel, monthStart, paidIn, shiftMonth, dueState, usualLag, cleanRef, trend, splitByKind, dueLabel, percentChange, type BillRow } from "../src/lib/personal/utilities";
import { pushMessage } from "../src/lib/push-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const bill = (id: string, kind: string, month: string, usd: number, extra: Partial<BillRow> = {}): BillRow => ({ id, kind, bill_month: month, amount: usd * 2, currency: "AWG", amount_usd: usd, paid_on: "2026-11-02", ...extra });

eq([monthStart("2026-11-14"), shiftMonth("2026-01-01", -1), shiftMonth("2026-11-01", 3), shiftMonth("2026-11-01", -12)], ["2026-11-01", "2025-12-01", "2027-02-01", "2025-11-01"], "months move across year ends");
eq([monthLabel("2026-03-01"), kindLabel("septic"), kindLabel("zzz")], ["March 2026", "Septic", "Other"], "labels");

const rows: BillRow[] = [
  bill("1", "water", "2026-11-01", 30, { provider: "WEB Aruba" }),
  bill("2", "electricity", "2026-11-01", 100, { paid_on: null, due_date: "2026-11-20" }),
  bill("3", "water", "2026-10-01", 20, { provider: "Old name" }),
  bill("4", "electricity", "2026-10-01", 90),
  bill("5", "phone", "2026-10-01", 15),
];
eq(paidIn(rows, "2026-11-01").map((r) => r.id), ["1", "3", "4", "5"], "a month lists the bills paid in it, whatever month they are for");
eq(dueBills(rows).map((r) => r.id), ["2"], "unpaid bills wait in the due list");
eq([toAwg(172.08), toAwg(0), toAwg(1), toAwg(67.04)], [308.02, 0, 1.79, 120], "dollars convert to florins at the 1.79 peg");
eq(monthChange(rows, "2026-11-01"), { total: 155, previous: 0, change: null }, "the month total counts what was paid, not unpaid bills");
eq(monthChange(rows, "2026-05-01").change, null, "no change figure when nothing was paid last month");
const lagRows: BillRow[] = [bill("e1", "electricity", "2026-09-01", 50, { provider: "Elmar", paid_on: "2026-11-03" }), bill("s1", "phone", "2026-10-01", 20, { provider: "Setar", paid_on: "2026-11-03" })];
eq([usualLag(lagRows, "electricity", "Elmar"), usualLag(lagRows, "phone", "setar"), usualLag([], "water"), usualLag(lagRows, "electricity", "Other co")], [2, 1, 1, 2], "usual lag follows the company, one month with no history");
eq([defaultBillMonth("2026-11-03", 2), defaultBillMonth("2026-01-10", 1)], ["2026-09-01", "2025-12-01"], "the bill month is the paid month minus the lag, across years");
eq(history(lagRows, "electricity", "2026-11-01").bars[3].usd, 50, "history stays by the month on the bill");
eq(lastProvider(rows, "water"), "WEB Aruba", "the newest company is remembered");
const pr = [{ kind: "water", paid_on: "2026-10-05" }, { kind: "phone", paid_on: "2026-10-06" }, { kind: "water", paid_on: "2026-11-03" }, { kind: "trash", paid_on: "2026-10-09" }, { kind: "trash", paid_on: null }];
eq(missingKinds(pr, "2026-11-01"), ["phone"], "the reminder lists utilities paid before with nothing paid or waiting this month");
eq(missingKinds(pr, "2026-10-01"), [], "nothing missing when nothing was paid earlier");
const h = history(rows, "water", "2026-11-01");
eq([h.bars.length, h.bars[5].usd, h.bars[4].usd, h.bars[0].usd, h.average, h.highest], [6, 30, 20, 0, 25, 30], "six months, average and highest count only months with a bill");
eq(history(rows, "trash", "2026-11-01").average, 0, "no bills, no average");
eq([dueState(rows[1], "2026-11-18"), dueState(rows[1], "2026-11-21"), dueState(rows[1], "2026-11-01"), dueState(rows[0], "2026-11-30")], ["soon", "late", null, null], "due soon, late, and never for a paid bill");
eq(pushMessage("utility", { item: "Water, Phone" }, "details").body, "Add this month's bills: Water, Phone.", "the reminder names the utilities, never an amount");
eq(pushMessage("utility", { item: "Water" }, "private").body, "Time to add your utility bills for this month.", "private wording is generic");

eq([cleanRef("  SET-48210937 "), cleanRef("a   b"), cleanRef("   "), cleanRef(null), cleanRef("x".repeat(100))?.length], ["SET-48210937", "a b", null, null, 80], "a payment reference is trimmed, tidied, limited to 80 characters, and empty means none");
eq(trend(rows, "2026-11-01", 4).map((t) => [t.month, t.usd]), [["2026-08-01", 0], ["2026-09-01", 0], ["2026-10-01", 0], ["2026-11-01", 155]], "the trend is what was paid in each of the last four months, oldest first");
const split = splitByKind(paidIn(rows, "2026-11-01"));
eq([split.map((x) => x.kind), split.reduce((a, x) => a + x.pct, 0), split[0].usd], [["electricity", "water", "phone"], 100, 90], "the split by utility is biggest first and adds up to 100");
eq(splitByKind([]), [], "nothing paid gives no split");
eq([dueLabel({ due_date: "2026-11-09" }, "2026-11-15"), dueLabel({ due_date: "2026-11-14" }, "2026-11-15"), dueLabel({ due_date: "2026-11-15" }, "2026-11-15"), dueLabel({ due_date: "2026-11-16" }, "2026-11-15"), dueLabel({ due_date: "2026-12-09" }, "2026-11-15"), dueLabel({}, "2026-11-15")],
  [{ text: "6 days late", state: "late" }, { text: "1 day late", state: "late" }, { text: "Due today", state: "soon" }, { text: "Due tomorrow", state: "soon" }, { text: "Due in 24 days", state: "later" }, { text: "No due date", state: "none" }], "a bill that is not paid says how late or how soon it is");
eq([percentChange(104.2, 100), percentChange(90, 100), percentChange(5, 0), percentChange(100, 100)], [4, -10, null, 0], "the change against last month is a whole percent, or nothing when last month had no payments");
process.exit(failed ? 1 : 0);
