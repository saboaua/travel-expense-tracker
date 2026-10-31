import ExcelJS from "exceljs";

export interface ExpenseRow {
  id: string;
  merchant: string | null;
  amount: number;
  currency?: string | null;
  exchange_rate?: number | null;
  amount_usd?: number | null;
  category: string | null;
  expense_date: string;
  notes: string | null;
  receipt_path: string | null;
}

export interface TripExportData {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  currency: string;
  status: string;
  expenses: ExpenseRow[];
  userName?: string;
  companyName?: string;
}

function usdOf(e: ExpenseRow, fallbackCurrency: string) {
  if (e.amount_usd != null) return Number(e.amount_usd);
  if ((e.currency || fallbackCurrency) === "USD") return Number(e.amount);
  return 0;
}

export async function buildTripWorkbook(trip: TripExportData): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Travel Expense Tracker";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Expenses");
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = trip.name;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A2").value = "Period";
  sheet.getCell("B2").value = `${trip.start_date}${trip.end_date ? ` \u2013 ${trip.end_date}` : ""}`;
  sheet.getCell("A3").value = "Trip currency";
  sheet.getCell("B3").value = trip.currency;
  if (trip.userName) {
    sheet.getCell("A4").value = "Prepared by";
    sheet.getCell("B4").value = trip.userName;
  }
  if (trip.companyName) {
    sheet.getCell("A5").value = "Company";
    sheet.getCell("B5").value = trip.companyName;
  }

  const headerRow = 7;
  const headers = ["Date", "Merchant", "Category", "Amount", "Currency", "Rate to USD", "Amount USD", "Notes", "Has Receipt"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });

  trip.expenses.forEach((e, idx) => {
    const row = headerRow + 1 + idx;
    sheet.getCell(row, 1).value = e.expense_date;
    sheet.getCell(row, 2).value = e.merchant || "";
    sheet.getCell(row, 3).value = e.category || "Other";
    sheet.getCell(row, 4).value = Number(e.amount);
    sheet.getCell(row, 4).numFmt = "#,##0.00";
    sheet.getCell(row, 5).value = e.currency || trip.currency;
    sheet.getCell(row, 6).value = e.exchange_rate != null ? Number(e.exchange_rate) : "";
    sheet.getCell(row, 7).value = usdOf(e, trip.currency);
    sheet.getCell(row, 7).numFmt = "#,##0.00";
    sheet.getCell(row, 8).value = e.notes || "";
    sheet.getCell(row, 9).value = e.receipt_path ? "Yes" : "No";
  });

  const totalRow = headerRow + 1 + trip.expenses.length;
  sheet.getCell(totalRow, 6).value = "Total USD";
  sheet.getCell(totalRow, 6).font = { bold: true };
  sheet.getCell(totalRow, 7).value = trip.expenses.reduce((s, e) => s + usdOf(e, trip.currency), 0);
  sheet.getCell(totalRow, 7).font = { bold: true };
  sheet.getCell(totalRow, 7).numFmt = "#,##0.00";

  sheet.columns = [
    { width: 14 }, { width: 28 }, { width: 16 }, { width: 12 },
    { width: 10 }, { width: 14 }, { width: 14 }, { width: 30 }, { width: 12 },
  ];

  const summary = workbook.addWorksheet("Summary");
  summary.getCell("A1").value = "Trip Summary";
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getCell("A3").value = "Trip";
  summary.getCell("B3").value = trip.name;
  summary.getCell("A4").value = "Status";
  summary.getCell("B4").value = trip.status;
  summary.getCell("A5").value = "Expenses count";
  summary.getCell("B5").value = trip.expenses.length;
  summary.getCell("A6").value = "Total USD";
  summary.getCell("B6").value = trip.expenses.reduce((s, e) => s + usdOf(e, trip.currency), 0);
  summary.getCell("B6").numFmt = "#,##0.00";

  const byCat: Record<string, number> = {};
  trip.expenses.forEach((e) => {
    const c = e.category || "Other";
    byCat[c] = (byCat[c] || 0) + usdOf(e, trip.currency);
  });
  summary.getCell("A8").value = "By category (USD)";
  summary.getCell("A8").font = { bold: true };
  let r = 9;
  Object.entries(byCat).sort(([, a], [, b]) => b - a).forEach(([cat, total]) => {
    summary.getCell(r, 1).value = cat;
    summary.getCell(r, 2).value = total;
    summary.getCell(r, 2).numFmt = "#,##0.00";
    r++;
  });
  summary.columns = [{ width: 22 }, { width: 16 }];

  return workbook.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}

export async function buildYearlyWorkbook(params: {
  year: number;
  trips: TripExportData[];
  userName?: string;
  companyName?: string;
}): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Travel Expense Tracker";

  const overview = workbook.addWorksheet("Year Overview");
  overview.getCell("A1").value = `${params.year} Travel Expenses`;
  overview.getCell("A1").font = { bold: true, size: 16 };
  if (params.userName) {
    overview.getCell("A2").value = "Prepared by";
    overview.getCell("B2").value = params.userName;
  }

  ["Trip", "Start", "End", "Currency", "Expenses", "Total USD"].forEach((h, i) => {
    const cell = overview.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });

  let row = 5;
  let grandTotal = 0;
  params.trips.forEach((trip) => {
    const total = trip.expenses.reduce((s, e) => s + usdOf(e, trip.currency), 0);
    grandTotal += total;
    overview.getCell(row, 1).value = trip.name;
    overview.getCell(row, 2).value = trip.start_date;
    overview.getCell(row, 3).value = trip.end_date || "";
    overview.getCell(row, 4).value = trip.currency;
    overview.getCell(row, 5).value = trip.expenses.length;
    overview.getCell(row, 6).value = total;
    overview.getCell(row, 6).numFmt = "#,##0.00";
    row++;
  });
  overview.getCell(row, 5).value = "Grand total";
  overview.getCell(row, 5).font = { bold: true };
  overview.getCell(row, 6).value = grandTotal;
  overview.getCell(row, 6).font = { bold: true };
  overview.getCell(row, 6).numFmt = "#,##0.00";
  overview.columns = [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 14 }];

  const all = workbook.addWorksheet("All Expenses");
  ["Trip", "Date", "Merchant", "Category", "Amount", "Currency", "Amount USD", "Notes"].forEach((h, i) => {
    const cell = all.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  });
  let er = 2;
  params.trips.forEach((trip) => {
    trip.expenses.forEach((e) => {
      all.getCell(er, 1).value = trip.name;
      all.getCell(er, 2).value = e.expense_date;
      all.getCell(er, 3).value = e.merchant || "";
      all.getCell(er, 4).value = e.category || "Other";
      all.getCell(er, 5).value = Number(e.amount);
      all.getCell(er, 5).numFmt = "#,##0.00";
      all.getCell(er, 6).value = e.currency || trip.currency;
      all.getCell(er, 7).value = usdOf(e, trip.currency);
      all.getCell(er, 7).numFmt = "#,##0.00";
      all.getCell(er, 8).value = e.notes || "";
      er++;
    });
  });
  all.columns = [{ width: 24 }, { width: 12 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 28 }];

  const monthly = workbook.addWorksheet("Monthly");
  const byMonth: Record<string, number> = {};
  params.trips.forEach((trip) => {
    trip.expenses.forEach((e) => {
      const m = e.expense_date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + usdOf(e, trip.currency);
    });
  });
  monthly.getCell("A1").value = "Month";
  monthly.getCell("B1").value = "Total USD";
  monthly.getCell("A1").font = { bold: true };
  monthly.getCell("B1").font = { bold: true };
  let mr = 2;
  Object.keys(byMonth).sort().forEach((m) => {
    monthly.getCell(mr, 1).value = m;
    monthly.getCell(mr, 2).value = byMonth[m];
    monthly.getCell(mr, 2).numFmt = "#,##0.00";
    mr++;
  });
  monthly.columns = [{ width: 12 }, { width: 14 }];

  return workbook.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}
