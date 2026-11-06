import ExcelJS from "exceljs";
import { buildTripWorkbook, buildYearlyWorkbook, buildMonthlyWorkbook, excelDate, periodText, monthTitle, categoryTotals, type ExpenseRow } from "../src/lib/export";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

const exp = (o: Partial<ExpenseRow> & { id: string }): ExpenseRow => ({
  merchant: "Shop", amount: 10, currency: "USD", exchange_rate: 1, amount_usd: 10, category: "Meals", expense_date: "2026-11-17", notes: null, receipt_path: null, ...o,
});
const expenses: ExpenseRow[] = [
  exp({ id: "1", merchant: "Copa Airlines", amount: 600, amount_usd: 600, category: "Flights", receipt_path: "a.jpg", notes: "AUA to PTY" }),
  exp({ id: "2", merchant: "Parking", amount: 75, currency: "AWG", exchange_rate: 0.5587, amount_usd: 41.9, category: "Ground transport", expense_date: "2026-11-18" }),
  exp({ id: "3", merchant: "Cafe", amount: 20, amount_usd: 20, category: null, expense_date: "2026-11-20", receipt_path: "b.jpg" }),
  exp({ id: "4", merchant: "No usd", amount: 5, currency: "EUR", exchange_rate: null, amount_usd: null, category: "Meals" }),
];
const TOTAL = 600 + 41.9 + 20; // the EUR row has no USD value and counts as 0

const load = async (buf: ExcelJS.Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
};

/* ---- helpers ---- */
eq(excelDate("2026-11-17").toISOString(), "2026-11-17T12:00:00.000Z", "excelDate: calendar date at noon UTC");
eq(periodText("2026-11-17", "2026-11-20"), "Nov 17, 2026 – Nov 20, 2026", "periodText: range");
eq(periodText("2026-11-17", null), "Nov 17, 2026", "periodText: open end shows the start only");
eq(monthTitle("2026-11"), "November 2026", "monthTitle");
eq(categoryTotals([{ category: "A", usd: 1 }, { category: null, usd: 5 }, { category: "A", usd: 2 }]), [["Other", 5], ["A", 3]], "categoryTotals: sorted, null is Other");

(async () => {
  /* ---- trip ---- */
  const trip = await load(await buildTripWorkbook({ id: "t", name: "Winlott & Co Meeting", destination: "Panama City", start_date: "2026-11-17", end_date: "2026-11-20", currency: "USD", status: "completed", expenses, userName: "Patrick", companyName: "Lotto Aruba" }));
  eq(trip.worksheets.map((w) => w.name), ["Summary", "Expenses"], "trip: sheets");
  const led = trip.getWorksheet("Expenses")!;
  eq(led.getCell("A5").value, "Date", "trip: header row is row 5");
  eq(led.getCell("A6").value instanceof Date, true, "trip: dates are real Excel dates");
  eq(led.getCell("B6").value, "Copa Airlines", "trip: merchant");
  eq(led.getCell("C8").value, "Other", "trip: missing category is Other");
  eq([led.getCell("H6").value, led.getCell("H7").value], ["✓", "–"], "trip: receipt marks");
  eq(led.getCell("G9").value, 0, "trip: an expense with no USD value counts as 0");
  const tot = led.getCell("G10").value as { formula: string; result: number };
  eq(tot.formula, "SUBTOTAL(109,G6:G9)", "trip: total follows the filter");
  eq(Math.round(tot.result * 100) / 100, TOTAL, "trip: total value");
  eq(!!led.autoFilter, true, "trip: filter on the header row");
  eq(led.views[0].state, "frozen", "trip: header and first columns frozen");
  eq(led.pageSetup.printTitlesRow, "5:5", "trip: header row repeats on printed pages");
  eq(led.headerFooter.oddFooter?.includes("Page &P of &N"), true, "trip: ledger footer has page numbers");
  const sum = trip.getWorksheet("Summary")!;
  eq(sum.getCell("B1").value, "TRIP EXPENSE REPORT", "trip: summary label");
  eq(sum.getCell("B2").value, "Winlott & Co Meeting", "trip: title");
  eq(sum.getCell("B6").value, TOTAL, "trip: total tile");
  eq(sum.getCell("E6").value, 4, "trip: expense count tile");
  eq(sum.getCell("H6").value, Math.round((TOTAL / 4) * 100) / 100, "trip: per-day tile (4 days)");
  eq(sum.headerFooter.oddFooter?.includes("Winlott && Co"), true, "trip: ampersand in a name is escaped in the footer");
  eq([18, 19, 20, 21].map((r) => sum.getCell(r, 2).value), ["Flights", "Ground transport", "Other", "Meals"], "trip: categories biggest first");
  eq((sum.getCell("F18").value as { formula: string }).formula, "IF(E22=0,0,E18/E22)", "trip: share formula guards a zero total");

  /* ---- trip with nothing in it, and an open end date ---- */
  const empty = await load(await buildTripWorkbook({ id: "t", name: "Empty", start_date: "2026-11-17", end_date: null, currency: "USD", status: "planned", expenses: [] }));
  const el = empty.getWorksheet("Expenses")!;
  eq(el.getCell("A6").value, "No expenses to show.", "empty trip: says so");
  eq((el.getCell("G7").value as { formula: string }).formula, "SUBTOTAL(109,G6:G6)", "empty trip: total formula stays valid");
  eq(empty.getWorksheet("Summary")!.getCell("B6").value, 0, "empty trip: total is 0");
  eq(empty.getWorksheet("Summary")!.getCell("H6").value, 0, "empty trip: per day is 0, not NaN");

  /* ---- year ---- */
  const t1 = { id: "a", name: "Panama", destination: "Panama City", start_date: "2026-11-17", end_date: "2026-11-20", currency: "USD", status: "completed", expenses };
  const t2 = { id: "b", name: "Miami", start_date: "2026-09-08", end_date: "2026-09-11", currency: "USD", status: "completed", expenses: [exp({ id: "9", amount: 100, amount_usd: 100, expense_date: "2026-09-09", category: "Hotel" })] };
  const year = await load(await buildYearlyWorkbook({ year: 2026, trips: [t1, t2], userName: "Patrick", companyName: "Lotto Aruba" }));
  eq(year.worksheets.map((w) => w.name), ["Overview", "By month", "All expenses"], "year: sheets");
  const ov = year.getWorksheet("Overview")!;
  eq(ov.getCell("B6").value, TOTAL + 100, "year: total tile");
  eq(ov.getCell("C6").value, 2, "year: trips tile");
  eq(ov.getCell("B10").value, "Panama", "year: first trip row");
  eq(ov.getCell("B11").value, "Miami", "year: second trip row");
  eq(ov.getCell("F10").value, 4, "year: trip length in days");
  const bm = year.getWorksheet("By month")!;
  eq([bm.getCell("B6").value instanceof Date, bm.getCell("C14").value, bm.getCell("D14").value], [true, 1, 100], "year: September row");
  eq(bm.getCell("D16").value, Math.round(TOTAL * 100) / 100, "year: November total");
  const all = year.getWorksheet("All expenses")!;
  eq(all.getCell("A6").value, "Miami", "year: all expenses sorted by date");
  eq((all.getCell("H11").value as { formula: string }).formula, "SUBTOTAL(109,H6:H10)", "year: ledger total formula");

  const yearEmpty = await load(await buildYearlyWorkbook({ year: 2025, trips: [] }));
  eq(yearEmpty.getWorksheet("Overview")!.getCell("B6").value, 0, "empty year: total is 0");
  eq(yearEmpty.getWorksheet("Overview")!.getCell("B10").value, "No trips started in 2025.", "empty year: says so");

  /* ---- month ---- */
  const month = await load(await buildMonthlyWorkbook({ month: "2026-11", userName: "Patrick", expenses: expenses.map((e) => ({ ...e, tripName: "Panama", destination: "Panama City" })) }));
  eq(month.worksheets.map((w) => w.name), ["Summary", "Expenses"], "month: sheets");
  eq(month.getWorksheet("Summary")!.getCell("B2").value, "November 2026", "month: title");
  eq(month.getWorksheet("Summary")!.getCell("H6").value, 1, "month: trips tile");
  const ml = month.getWorksheet("Expenses")!;
  eq([ml.getCell("B6").value, ml.getCell("C6").value, ml.getCell("D6").value], ["Panama", "Panama City", "Copa Airlines"], "month: trip, destination, merchant");
  eq((ml.getCell("I10").value as { formula: string }).formula, "SUBTOTAL(109,I6:I9)", "month: total formula");

  console.log(failed ? `${failed} FAILED` : "all export checks passed");
  process.exit(failed ? 1 : 0);
})();
