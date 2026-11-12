import { history, kindLabel, lastProvider, missingKinds, monthChange, monthLabel, monthLines, monthStart, shiftMonth, dueState, type BillRow } from "../src/lib/personal/utilities";
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
const lines = monthLines(rows, "2026-11-01");
eq(lines.map((l) => [l.kind, l.status]), [["water", "paid"], ["electricity", "unpaid"], ["phone", "missing"]], "paid, not paid yet and no bill yet, in a fixed order");
eq(monthChange(rows, "2026-11-01"), { total: 130, previous: 125, change: 5 }, "this month against last month");
eq(monthChange(rows, "2026-05-01").change, null, "no change figure when last month has no bills");
eq(lastProvider(rows, "water"), "WEB Aruba", "the newest company is remembered");
eq(missingKinds(rows, "2026-11-01"), ["phone"], "the reminder lists utilities you usually pay with no bill yet");
eq(missingKinds(rows, "2026-10-01"), [], "nothing missing when there is no earlier month");
const h = history(rows, "water", "2026-11-01");
eq([h.bars.length, h.bars[5].usd, h.bars[4].usd, h.bars[0].usd, h.average, h.highest], [6, 30, 20, 0, 25, 30], "six months, average and highest count only months with a bill");
eq(history(rows, "trash", "2026-11-01").average, 0, "no bills, no average");
const two = [bill("a", "water", "2026-11-01", 10), bill("b", "water", "2026-11-01", 5, { paid_on: null })];
eq(monthLines(two, "2026-11-01")[0].status, "unpaid", "two bills in a month: unpaid until all are paid");
eq(monthLines(two, "2026-11-01")[0].usd, 15, "two bills add up");
eq([dueState(rows[1], "2026-11-18"), dueState(rows[1], "2026-11-21"), dueState(rows[1], "2026-11-01"), dueState(rows[0], "2026-11-30")], ["soon", "late", null, null], "due soon, late, and never for a paid bill");
eq(pushMessage("utility", { item: "Water, Phone" }, "details").body, "Add this month's bills: Water, Phone.", "the reminder names the utilities, never an amount");
eq(pushMessage("utility", { item: "Water" }, "private").body, "Time to add your utility bills for this month.", "private wording is generic");
process.exit(failed ? 1 : 0);
