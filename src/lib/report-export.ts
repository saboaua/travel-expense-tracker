import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCurrency, formatDate } from "@/lib/utils";

/** One engine for every Pro report: a title, a table, totals, and (when switched on) the business logo and name at the top. */

export type ReportLogo = { bytes: Uint8Array; type: "png" | "jpeg" };
export type ReportColumn = {
  header: string;
  key: string;
  width: number; // Excel width; the PDF scales it
  kind: "text" | "date" | "money" | "number";
  /** money: a fixed currency, or the row field that holds it */
  currency?: string;
  currencyKey?: string;
};
export type ReportCell = string | number | null | undefined;
export type ReportData = {
  title: string;
  subtitle?: string;
  company?: string | null;
  logo?: ReportLogo | null;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  total: { label: string; value: number; currency: string };
  summaryTitle?: string;
  summary?: [string, number][];
  summaryCurrency?: string;
  note?: string;
};

/** PNG or JPEG by its first bytes; anything else is not used as a logo. */
export function logoType(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

export const reportFileName = (name: string, suffix: string, ext: "xlsx" | "pdf") => `${name.replace(/[^a-z0-9-_]/gi, "_") || "report"}_${suffix}.${ext}`;

const moneyOf = (c: ReportColumn, row: Record<string, ReportCell>) => c.currencyKey ? String(row[c.currencyKey] ?? c.currency ?? "USD") : c.currency ?? "USD";
const numFmt = (cur: string) => (cur === "USD" ? '"$"#,##0.00' : `"${cur} "#,##0.00`);

export async function buildReportWorkbook(d: ReportData): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  const nCols = d.columns.length;
  let top = 1;
  if (d.logo) {
    const id = wb.addImage({ buffer: d.logo.bytes as unknown as ExcelJS.Buffer, extension: d.logo.type });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
    for (let r = 1; r <= 4; r++) ws.getRow(r).height = 18;
    top = 5;
    if (d.company) { ws.getCell(1, 2).value = d.company; ws.getCell(1, 2).font = { bold: true, size: 14 }; }
    ws.getCell(2, 2).value = d.title; ws.getCell(2, 2).font = { bold: true, size: 12 };
    if (d.subtitle) { ws.getCell(3, 2).value = d.subtitle; ws.getCell(3, 2).font = { color: { argb: "FF64748B" } }; }
  } else {
    if (d.company) { ws.addRow([d.company]).font = { bold: true, size: 12 }; top++; }
    ws.addRow([d.title]).font = { bold: true, size: 16 }; top++;
    if (d.subtitle) { ws.addRow([d.subtitle]).font = { color: { argb: "FF64748B" } }; top++; }
    ws.addRow([]); top++;
  }
  ws.getRow(top).values = d.columns.map((c) => c.header);
  const head = ws.getRow(top);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; });
  let r = top + 1;
  for (const row of d.rows) {
    const xr = ws.getRow(r++);
    d.columns.forEach((c, i) => {
      const v = row[c.key];
      const cell = xr.getCell(i + 1);
      if (c.kind === "date" && typeof v === "string" && v) { cell.value = new Date(`${v}T00:00:00Z`); cell.numFmt = "dd mmm yyyy"; }
      else if (c.kind === "money" && typeof v === "number") { cell.value = v; cell.numFmt = numFmt(moneyOf(c, row)); }
      else if (c.kind === "number" && typeof v === "number") { cell.value = v; cell.numFmt = "#,##0.##"; }
      else cell.value = v == null ? "" : v;
    });
  }
  const moneyIdx = Math.max(0, d.columns.map((c) => c.kind).lastIndexOf("money"));
  const tot = ws.getRow(r++);
  tot.getCell(1).value = d.total.label; tot.getCell(moneyIdx + 1).value = d.total.value; tot.getCell(moneyIdx + 1).numFmt = numFmt(d.total.currency); tot.font = { bold: true };
  if (d.summary?.length) {
    r++;
    ws.getRow(r++).getCell(1).value = d.summaryTitle ?? "Totals"; ws.getRow(r - 1).font = { bold: true };
    for (const [k, v] of d.summary) { const sr = ws.getRow(r++); sr.getCell(1).value = k; sr.getCell(moneyIdx + 1).value = v; sr.getCell(moneyIdx + 1).numFmt = numFmt(d.summaryCurrency ?? d.total.currency); }
  }
  if (d.note) { r++; ws.getRow(r).getCell(1).value = d.note; ws.getRow(r).font = { italic: true, color: { argb: "FF64748B" } }; }
  d.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  if (nCols < 2) ws.getColumn(2).width = 20;
  return wb.xlsx.writeBuffer();
}

export async function buildReportPdf(d: ReportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?"); // the built-in fonts cannot draw every character
  const ink = rgb(0.06, 0.09, 0.16), muted = rgb(0.39, 0.45, 0.55);
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color });
  const fit = (s: string, max: number, size: number, f: PDFFont) => { let t = clean(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2); return t; };
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };

  // the top: logo and company on the left, the report name under them
  let textX = M;
  if (d.logo) {
    try {
      const img = d.logo.type === "png" ? await pdf.embedPng(d.logo.bytes) : await pdf.embedJpg(d.logo.bytes);
      const box = 56, sc = Math.min(box / img.width, box / img.height);
      page.drawImage(img, { x: M, y: y - img.height * sc + 6, width: img.width * sc, height: img.height * sc });
      textX = M + box + 14;
    } catch { /* an unreadable logo is left out; the report still downloads */ }
  }
  if (d.company) { text(d.company, textX, 14, bold); y -= 20; }
  text(d.title, textX, d.company ? 11 : 20, d.company ? font : bold, d.company ? ink : ink); y -= d.company ? 15 : 22;
  if (d.subtitle) { text(d.subtitle, textX, 10, font, muted); y -= 14; }
  y = Math.min(y, H - M - (d.logo ? 62 : 0)) - 12;
  text(`${d.total.label}: ${formatCurrency(d.total.value, d.total.currency)}`, M, 13, bold); y -= 24;

  const usable = W - 2 * M;
  const sum = d.columns.reduce((t, c) => t + c.width, 0);
  const xs: number[] = []; const ws: number[] = [];
  let acc = M;
  for (const c of d.columns) { const w = (c.width / sum) * usable; xs.push(acc); ws.push(w); acc += w; }
  const right = (c: ReportColumn) => c.kind === "money" || c.kind === "number";
  const put = (s: string, i: number, size: number, f: PDFFont, color = ink) => {
    const c = d.columns[i]; const t = fit(s, ws[i] - 6, size, f);
    const x = right(c) ? xs[i] + ws[i] - 6 - f.widthOfTextAtSize(t, size) : xs[i];
    text(t, x, size, f, color);
  };
  const header = () => { d.columns.forEach((c, i) => put(c.header, i, 9, bold, rgb(0.28, 0.33, 0.41))); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.84, 0.9) }); y -= 14; };
  header();
  for (const row of d.rows) {
    if (y < M + 30) { newPage(); header(); }
    d.columns.forEach((c, i) => {
      const v = row[c.key];
      const s = c.kind === "date" ? (typeof v === "string" && v ? formatDate(v) : "") : c.kind === "money" ? (typeof v === "number" ? formatCurrency(v, moneyOf(c, row)) : "") : c.kind === "number" ? (typeof v === "number" ? String(Math.round(v * 100) / 100) : "") : String(v ?? "");
      put(s, i, 9.5, font);
    });
    y -= 15;
  }
  y -= 8;
  if (d.summary?.length) {
    if (y < M + 60) newPage();
    text(d.summaryTitle ?? "Totals", M, 11, bold); y -= 16;
    for (const [k, v] of d.summary) { if (y < M) newPage(); text(fit(k, 300, 10, font), M, 10); const t = formatCurrency(v, d.summaryCurrency ?? d.total.currency); text(t, W - M - font.widthOfTextAtSize(t, 10), 10); y -= 14; }
  }
  if (d.note) { y -= 6; if (y < M) newPage(); text(d.note, M, 9, font, muted); }
  return pdf.save();
}
