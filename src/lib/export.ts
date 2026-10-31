import ExcelJS from "exceljs";

export interface ExpenseRow {
  id: string;
  merchant: string | null;
  amount: number;
  currency?: string | null;
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

export async function buildTripWorkbook(trip: TripExportData): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Travel Expense Tracker";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Expenses");

  // Header info
  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = trip.name;
  sheet.getCell("A1").font = { bold: true, size: 16 };

  sheet.getCell("A2").value = "Period";
  sheet.getCell("B2").value = `${trip.start_date}${trip.end_date ? ` – ${trip.end_date}` : ""}`;

  sheet.getCell("A3").value = "Currency";
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
  const headers = ["Date", "Merchant", "Category", "Amount", "Notes", "Has Receipt"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  trip.expenses.forEach((e, idx) => {
    const row = headerRow + 1 + idx;
    sheet.getCell(row, 1).value = e.expense_date;
    sheet.getCell(row, 2).value = e.merchant || "";
    sheet.getCell(row, 3).value = e.category || "Other";
    sheet.getCell(row, 4).value = Number(e.amount);
    sheet.getCell(row, 4).numFmt = "#,##0.00";
    sheet.getCell(row, 5).value = e.notes || "";
    sheet.getCell(row, 6).value = e.receipt_path ? "Yes" : "No";
  });

  const totalRow = headerRow + 1 + trip.expenses.length;
  sheet.getCell(totalRow, 3).value = "Total";
  sheet.getCell(totalRow, 3).font = { bold: true };
  sheet.getCell(totalRow, 4).value = {
    formula: `SUM(D${headerRow + 1}:D${totalRow - 1})`,
  };
  sheet.getCell(totalRow, 4).font = { bold: true };
  sheet.getCell(totalRow, 4).numFmt = "#,##0.00";

  sheet.columns = [
    { width: 14 },
    { width: 28 },
    { width: 16 },
    { width: 12 },
    { width: 30 },
    { width: 12 },
  ];

  // Summary sheet
  const summary = workbook.addWorksheet("Summary");
  summary.getCell("A1").value = "Trip Summary";
  summary.getCell("A1").font = { bold: true, size: 14 };
  summary.getCell("A3").value = "Trip";
  summary.getCell("B3").value = trip.name;
  summary.getCell("A4").value = "Status";
  summary.getCell("B4").value = trip.status;
  summary.getCell("A5").value = "Expenses count";
  summary.getCell("B5").value = trip.expenses.length;
  summary.getCell("A6").value = "Total amount";
  summary.getCell("B6").value = trip.expenses.reduce((s, e) => s + Number(e.amount), 0);
  summary.getCell("B6").numFmt = "#,##0.00";

  // Category breakdown
  const byCat: Record<string, number> = {};
  trip.expenses.forEach((e) => {
    const c = e.category || "Other";
    byCat[c] = (byCat[c] || 0) + Number(e.amount);
  });
  summary.getCell("A8").value = "By category";
  summary.getCell("A8").font = { bold: true };
  let r = 9;
  Object.entries(byCat)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, total]) => {
      summary.getCell(r, 1).value = cat;
      summary.getCell(r, 2).value = total;
      summary.getCell(r, 2).numFmt = "#,##0.00";
      r++;
    });

  summary.columns = [{ width: 20 }, { width: 16 }];

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

  overview.getCell("A4").value = "Trip";
  overview.getCell("B4").value = "Start";
  overview.getCell("C4").value = "End";
  overview.getCell("D4").value = "Currency";
  overview.getCell("E4").value = "Expenses";
  overview.getCell("F4").value = "Total";
  ["A4", "B4", "C4", "D4", "E4", "F4"].forEach((ref) => {
    overview.getCell(ref).font = { bold: true, color: { argb: "FFFFFFFF" } };
    overview.getCell(ref).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
  });

  let row = 5;
  let grandTotal = 0;
  params.trips.forEach((trip) => {
    const total = trip.expenses.reduce((s, e) => s + Number(e.amount), 0);
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

  overview.columns = [
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
  ];

  // All expenses sheet
  const all = workbook.addWorksheet("All Expenses");
  const headers = ["Trip", "Date", "Merchant", "Category", "Amount", "Currency", "Notes"];
  headers.forEach((h, i) => {
    const cell = all.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
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
      all.getCell(er, 6).value = trip.currency;
      all.getCell(er, 7).value = e.notes || "";
      er++;
    });
  });

  all.columns = [
    { width: 24 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 28 },
  ];

  // Monthly sheet
  const monthly = workbook.addWorksheet("Monthly");
  const byMonth: Record<string, number> = {};
  params.trips.forEach((trip) => {
    trip.expenses.forEach((e) => {
      const m = e.expense_date.slice(0, 7); // YYYY-MM
      byMonth[m] = (byMonth[m] || 0) + Number(e.amount);
    });
  });
  monthly.getCell("A1").value = "Month";
  monthly.getCell("B1").value = "Total";
  monthly.getCell("A1").font = { bold: true };
  monthly.getCell("B1").font = { bold: true };
  let mr = 2;
  Object.keys(byMonth)
    .sort()
    .forEach((m) => {
      monthly.getCell(mr, 1).value = m;
      monthly.getCell(mr, 2).value = byMonth[m];
      monthly.getCell(mr, 2).numFmt = "#,##0.00";
      mr++;
    });
  monthly.columns = [{ width: 12 }, { width: 14 }];

  return workbook.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}
