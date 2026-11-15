import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ProjectExportLine = { date: string; merchant: string; category: string; amount: number; currency: string; usd: number; notes: string };
export type ProjectExportData = { name: string; typeLabel: string; budget: number | null; currency: string; status: string; lines: ProjectExportLine[]; ownerName?: string };

type Src = { merchant: string | null; amount: number | string; currency: string | null; amount_usd: number | string | null; category: string | null; expense_date: string; notes?: string | null };

/** One list from a project's own expenses and the quick spends attached to it, oldest first. */
export function projectLines(expenses: Src[], spends: Src[]): ProjectExportLine[] {
  return [...expenses, ...spends]
    .map((e) => ({ date: e.expense_date, merchant: e.merchant?.trim() || "", category: e.category || "Other", amount: Number(e.amount) || 0, currency: e.currency || "USD", usd: Number(e.amount_usd) || 0, notes: e.notes?.trim() || "" }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function projectTotals(lines: ProjectExportLine[]): { usd: number; byCategory: [string, number][] } {
  const by = new Map<string, number>();
  let usd = 0;
  for (const l of lines) { usd += l.usd; by.set(l.category, (by.get(l.category) ?? 0) + l.usd); }
  return { usd: Math.round(usd * 100) / 100, byCategory: [...by.entries()].sort((a, b) => b[1] - a[1]) };
}

export const projectFileName = (name: string, ext: "xlsx" | "pdf") => `${name.replace(/[^a-z0-9-_]/gi, "_") || "project"}_expenses.${ext}`;

export async function buildProjectWorkbook(d: ProjectExportData): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Expenses");
  const { usd, byCategory } = projectTotals(d.lines);
  ws.addRow([d.name]).font = { bold: true, size: 16 };
  ws.addRow([`${d.typeLabel} project${d.ownerName ? ` · ${d.ownerName}` : ""}${d.budget ? ` · budget ${formatCurrency(d.budget, d.currency)}` : ""}`]).font = { color: { argb: "FF64748B" } };
  ws.addRow([]);
  const head = ws.addRow(["Date", "Merchant", "Category", "Amount", "Currency", "Amount (USD)", "Notes"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; });
  for (const l of d.lines) {
    const r = ws.addRow([new Date(`${l.date}T00:00:00Z`), l.merchant, l.category, l.amount, l.currency, l.usd, l.notes]);
    r.getCell(1).numFmt = "dd mmm yyyy"; r.getCell(4).numFmt = "#,##0.00"; r.getCell(6).numFmt = '"$"#,##0.00';
  }
  const total = ws.addRow(["Total", "", "", "", "", usd]);
  total.font = { bold: true }; total.getCell(6).numFmt = '"$"#,##0.00';
  ws.addRow([]);
  ws.addRow(["By category"]).font = { bold: true };
  for (const [cat, v] of byCategory) { const r = ws.addRow([cat, "", "", "", "", v]); r.getCell(6).numFmt = '"$"#,##0.00'; }
  [12, 26, 18, 12, 10, 14, 34].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return wb.xlsx.writeBuffer();
}

export async function buildProjectPdf(d: ProjectExportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?"); // the built-in fonts cannot draw every character
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = rgb(0.06, 0.09, 0.16)) => page.drawText(clean(s), { x, y, size, font: f, color });
  const fit = (s: string, max: number, size: number, f: PDFFont) => { let t = clean(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2); return t; };
  const { usd, byCategory } = projectTotals(d.lines);
  text(d.name, M, 20, bold); y -= 20;
  text(`${d.typeLabel} project${d.ownerName ? `  -  ${d.ownerName}` : ""}${d.budget ? `  -  budget ${formatCurrency(d.budget, d.currency)}` : ""}`, M, 10, font, rgb(0.39, 0.45, 0.55)); y -= 26;
  text(`Total spent: ${formatCurrency(usd, "USD")}`, M, 13, bold); y -= 24;
  const cols = [M, M + 70, M + 220, M + 330, M + 430];
  const header = () => { ["Date", "Merchant", "Category", "Amount", "USD"].forEach((h, i) => text(h, cols[i], 9, bold, rgb(0.28, 0.33, 0.41))); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.84, 0.9) }); y -= 14; };
  header();
  for (const l of d.lines) {
    if (y < M + 30) { page = pdf.addPage([W, H]); y = H - M; header(); }
    text(formatDate(l.date), cols[0], 10);
    text(fit(l.merchant || "-", 140, 10, font), cols[1], 10);
    text(fit(l.category, 100, 10, font), cols[2], 10);
    text(fit(formatCurrency(l.amount, l.currency), 95, 10, font), cols[3], 10);
    text(formatCurrency(l.usd, "USD"), cols[4], 10);
    y -= 16;
  }
  y -= 10;
  if (byCategory.length) {
    if (y < M + 60) { page = pdf.addPage([W, H]); y = H - M; }
    text("By category", M, 11, bold); y -= 16;
    for (const [cat, v] of byCategory) { if (y < M) { page = pdf.addPage([W, H]); y = H - M; } text(fit(cat, 200, 10, font), M, 10); text(formatCurrency(v, "USD"), cols[4], 10); y -= 14; }
  }
  return pdf.save();
}
