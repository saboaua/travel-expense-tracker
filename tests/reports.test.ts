import ExcelJS from "exceljs";
import { logoType, buildReportPdf, buildReportWorkbook, type ReportData } from "../src/lib/report-export";
import { monthReport, type MonthRaw } from "../src/lib/personal/month-report";
import { spentByArea, type MonthInputs } from "../src/lib/personal/budget";
import { isMonth } from "../src/lib/report-server";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
eq("a PNG is a PNG", logoType(PNG), "png");
eq("a JPEG is a JPEG", logoType(JPG), "jpeg");
eq("a script is no logo", logoType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
eq("empty is no logo", logoType(new Uint8Array()), null);
eq("month check", [isMonth("2026-11"), isMonth("2026-13"), isMonth("2026-1"), isMonth("x"), isMonth(null)], [true, false, false, false, false]);

// the month overview adds up to the same totals as "Where it goes" and the budget
const raw: MonthRaw = {
  receipts: [{ id: "r1", store: "Super Food", purchase_date: "2026-11-03", total: 100, currency: "AWG" }, { id: "r2", store: "Cost-U-Less", purchase_date: "2026-11-09", total: 50, currency: "USD" }],
  shopItems: [{ receipt_id: "r1", name: "Notebook", category: "Stationery", line_total: 12.5, purchase_date: "2026-11-03", store: "Super Food", currency: "AWG" }],
  utilities: [{ kind: "water", provider: "WEB", paid_on: "2026-11-05", amount_usd: 20 }],
  spends: [{ merchant: "Coffee", category: "Street food", expense_date: "2026-11-04", amount: 4.5, currency: "AWG" }, { merchant: "Hinge", category: "House", expense_date: "2026-11-06", amount: 10, currency: "USD" }, { merchant: "Euro shop", category: "Shopping", expense_date: "2026-11-07", amount: 9, currency: "EUR", amount_usd: null }],
  projectExpenses: [{ merchant: "Paint", category: "Materials", expense_date: "2026-11-08", amount_usd: 30, project_name: "Kitchen remodel" }],
  savings: [{ amount: 200, currency: "AWG" }],
  fixed: [{ kind: "car_loan", category: "loans", amount: 350, currency: "AWG" }, { kind: "home_insurance", category: "insurances", amount: 40, currency: "USD" }],
};
const inputs: MonthInputs = {
  groceries: raw.receipts.map((r) => ({ total: r.total, currency: r.currency })),
  shopping: raw.shopItems.map((s) => ({ amount: s.line_total, currency: s.currency })),
  utilities: raw.utilities.map((u) => ({ amount_usd: u.amount_usd })),
  spends: raw.spends,
  projects: raw.projectExpenses.map((p) => ({ amount_usd: p.amount_usd })),
  savings: raw.savings, fixed: raw.fixed,
};
const rep = monthReport(raw, "AWG", "2026-11-01");
const app = spentByArea(inputs, "AWG");
const NAME: Record<string, string> = { groceries: "Groceries", shopping: "Shopping", utilities: "Utilities", quick: "Quick spend", house: "House & repairs", savings: "Savings", loans: "Loans", insurances: "Insurances", cards: "Credit card", gambling: "Gambling" };
const mine = Object.fromEntries(rep.byArea);
for (const [k, label] of Object.entries(NAME)) eq(`area ${label} matches the app`, mine[label] ?? 0, (app as Record<string, number>)[k] ?? 0);
eq("a receipt's shopping lines come out of its groceries", rep.lines.filter((l) => l.area === "Groceries").map((l) => [l.name, l.amount]), [["Super Food", 87.5], ["Cost-U-Less", 89.5]]);
eq("a spend in a currency that cannot be converted is counted as left out", rep.uncounted, 1);
eq("lines are oldest first", rep.lines.map((l) => l.date).every((d, i, a) => i === 0 || a[i - 1] <= d), true);
eq("the total is the sum of the areas", rep.total, Math.round(rep.byArea.reduce((t, [, v]) => t + v, 0) * 100) / 100);

// the logo and company are in both files
(async () => {
  const data: ReportData = {
    title: "Expense overview, November 2026", subtitle: "Amounts in AWG", company: "Lotto Brands Aruba", logo: { bytes: PNG, type: "png" },
    columns: [{ header: "Date", key: "date", width: 13, kind: "date" }, { header: "What", key: "name", width: 30, kind: "text" }, { header: "Amount", key: "amount", width: 14, kind: "money", currency: "AWG" }],
    rows: [{ date: "2026-11-03", name: "Super Food", amount: 87.5 }], total: { label: "Total spent", value: 87.5, currency: "AWG" }, summary: [["Groceries", 87.5]], summaryTitle: "By area",
  };
  const withLogo = await buildReportWorkbook(data);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(withLogo as ArrayBuffer);
  const ws = wb.getWorksheet("Report")!;
  eq("the Excel file holds the logo picture", wb.model.media?.length, 1);
  eq("the Excel header has the company, the title and the table below", [ws.getCell("B1").value, ws.getCell("B2").value, ws.getCell("A5").value, ws.getCell("B6").value], ["Lotto Brands Aruba", "Expense overview, November 2026", "Date", "Super Food"]);
  const noLogo = await buildReportWorkbook({ ...data, logo: null, company: null });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(noLogo as ArrayBuffer);
  eq("without a logo there is no picture and the title is on top", [wb2.model.media?.length ?? 0, wb2.getWorksheet("Report")!.getCell("A1").value], [0, "Expense overview, November 2026"]);
  const p1 = await buildReportPdf(data), p0 = await buildReportPdf({ ...data, logo: null, company: null });
  eq("the PDF with a logo is a PDF and bigger", [new TextDecoder().decode(p1.slice(0, 5)), p1.length > p0.length], ["%PDF-", true]);
  const bad = await buildReportPdf({ ...data, logo: { bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]), type: "png" } });
  eq("a broken logo is left out and the PDF still builds", new TextDecoder().decode(bad.slice(0, 5)), "%PDF-");
  console.log(fail ? `${fail} FAILED` : "ALL PASSED");
  process.exit(fail ? 1 : 0);
})();
