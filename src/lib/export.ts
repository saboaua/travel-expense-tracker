import ExcelJS from "exceljs";
import { daysBetween, todayISO } from "@/lib/utils";

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

interface TripExportData {
  id: string;
  name: string;
  destination?: string | null;
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

/* ------------------------------------------------------------------ look */

const C = {
  brand: "FF2563EB",
  brandDark: "FF1E3A8A",
  brandSoft: "FFEFF6FF",
  bar: "FF60A5FA",
  ink: "FF0F172A",
  muted: "FF64748B",
  line: "FFE2E8F0",
  zebra: "FFF8FAFC",
  white: "FFFFFFFF",
  green: "FF047857",
  red: "FFB91C1C",
} as const;

const FONT = "Calibri";
const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 11, color: { argb: C.ink }, ...o });
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const hairline: Partial<ExcelJS.Border> = { style: "thin", color: { argb: C.line } };

export const MONEY_FMT = "#,##0.00";
export const USD_FMT = '"$"#,##0.00';
export const DATE_FMT = "dd mmm yyyy";

type Align = "left" | "center" | "right";

/** A calendar date as an Excel date. Noon UTC so no time zone can move it to another day. */
export function excelDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(excelDate(iso));

export function periodText(start: string, end: string | null): string {
  return end && end !== start ? `${longDate(start)} – ${longDate(end)}` : longDate(start);
}

/** "2026-11" -> "November 2026". */
export function monthTitle(month: string): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function categoryTotals(rows: { category: string | null; usd: number }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = r.category || "Other";
    m.set(c, (m.get(c) || 0) + r.usd);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Travel Expense Tracker";
  wb.created = new Date();
  return wb;
}

function sheet(wb: ExcelJS.Workbook, name: string, tab: string, view: Partial<ExcelJS.WorksheetView> = {}) {
  return wb.addWorksheet(name, { views: [{ showGridLines: false, ...view } as ExcelJS.WorksheetView], properties: { tabColor: { argb: tab } } });
}

/** Blue title band on rows 1-3 over columns c1..c2: small label, big title, subtitle. */
function band(ws: ExcelJS.Worksheet, c1: number, c2: number, label: string, title: string, subtitle: string) {
  for (let r = 1; r <= 3; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).fill = fill(C.brand);
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 34;
  ws.getRow(3).height = 22;
  const put = (r: number, v: string, f: Partial<ExcelJS.Font>) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    const cell = ws.getCell(r, c1);
    cell.value = v;
    cell.font = f;
    cell.alignment = { vertical: "middle", indent: 1 };
  };
  put(1, label.toUpperCase(), font({ size: 9, bold: true, color: { argb: "FFBFDBFE" } }));
  put(2, title, font({ size: 20, bold: true, color: { argb: C.white } }));
  put(3, subtitle, font({ color: { argb: "FFDBEAFE" } }));
}

/** A key figure over columns c1..c2: small label above, large value below. */
function tile(ws: ExcelJS.Worksheet, r: number, c1: number, c2: number, label: string, value: number, fmt: string) {
  for (const rr of [r, r + 1]) {
    if (c2 > c1) ws.mergeCells(rr, c1, rr, c2);
    for (let c = c1; c <= c2; c++) ws.getCell(rr, c).fill = fill(C.brandSoft);
  }
  ws.getRow(r).height = 20;
  ws.getRow(r + 1).height = 34;
  const l = ws.getCell(r, c1);
  l.value = label;
  l.font = font({ size: 9, bold: true, color: { argb: C.muted } });
  l.alignment = { vertical: "bottom", indent: 1 };
  const v = ws.getCell(r + 1, c1);
  v.value = value;
  v.numFmt = fmt;
  v.font = font({ size: 20, bold: true, color: { argb: C.brand } });
  v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function sectionTitle(ws: ExcelJS.Worksheet, r: number, c1: number, c2: number, text: string) {
  if (c2 > c1) ws.mergeCells(r, c1, r, c2);
  const cell = ws.getCell(r, c1);
  cell.value = text;
  cell.font = font({ size: 13, bold: true, color: { argb: C.brandDark } });
  cell.alignment = { vertical: "middle" };
  for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = { bottom: { style: "medium", color: { argb: C.brand } } };
  ws.getRow(r).height = 24;
}

function headerRow(ws: ExcelJS.Worksheet, r: number, c1: number, labels: string[], aligns: (Align | undefined)[] = []) {
  ws.getRow(r).height = 24;
  labels.forEach((t, i) => {
    const cell = ws.getCell(r, c1 + i);
    cell.value = t;
    cell.font = font({ bold: true, color: { argb: C.white } });
    cell.fill = fill(C.brand);
    cell.alignment = { vertical: "middle", horizontal: aligns[i], indent: aligns[i] ? 0 : 1, wrapText: true };
  });
}

function bodyCell(cell: ExcelJS.Cell, i: number, o: { align?: Align; fmt?: string; indent?: number; wrap?: boolean } = {}) {
  cell.font = font();
  cell.fill = fill(i % 2 ? C.zebra : C.white);
  cell.border = { bottom: hairline };
  cell.alignment = { vertical: "middle", horizontal: o.align, indent: o.indent ?? (o.align ? 0 : 1), wrapText: o.wrap };
  if (o.fmt) cell.numFmt = o.fmt;
}

function totalRowStyle(ws: ExcelJS.Worksheet, r: number, c1: number, c2: number) {
  ws.getRow(r).height = 26;
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(r, c);
    cell.fill = fill(C.brandSoft);
    cell.border = { top: { style: "medium", color: { argb: C.brand } } };
    cell.font = font({ bold: true });
    cell.alignment = { vertical: "middle", horizontal: cell.alignment?.horizontal, indent: cell.alignment?.indent };
  }
}

function dataBar(ws: ExcelJS.Worksheet, ref: string, max: number) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "dataBar",
        priority: 1,
        gradient: false,
        cfvo: [{ type: "num", value: 0 }, { type: "num", value: max > 0 ? max : 1 }],
        color: { argb: C.bar },
      } as unknown as ExcelJS.ConditionalFormattingRule,
    ],
  });
}

/** A4 page, fit to one page wide, repeating header row and a "page x of y" footer. */
function printSetup(ws: ExcelJS.Worksheet, o: { landscape: boolean; title: string; repeat?: string }) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: o.landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    horizontalCentered: true,
    ...(o.repeat ? { printTitlesRow: o.repeat } : {}),
  };
  // "&" starts a footer code, so a name like "Smith & Co" needs it doubled; the space stops "&8" eating a leading digit.
  ws.headerFooter = { oddFooter: `&L&8 ${o.title.replace(/&/g, "&&")}&R&8 Page &P of &N` };
}

/* ---------------------------------------------------------------- ledger */

interface LedgerCol {
  header: string;
  width: number;
  align?: Align;
  fmt?: string;
  wrap?: boolean;
  kind?: "usd" | "receipt";
}

interface LedgerRow {
  values: (string | number | Date)[];
  usd: number;
}

/**
 * The expense table: header, banded rows, a filter on every column and a total that follows the filter (SUBTOTAL).
 * The "usd" column carries the total. Returns the total row number.
 */
function ledger(ws: ExcelJS.Worksheet, startRow: number, cols: LedgerCol[], rows: LedgerRow[], totalLabelCol: number): number {
  headerRow(ws, startRow, 1, cols.map((c) => c.header), cols.map((c) => c.align));
  rows.forEach((row, i) => {
    const r = startRow + 1 + i;
    ws.getRow(r).height = 20;
    cols.forEach((col, ci) => {
      const cell = ws.getCell(r, ci + 1);
      const v = row.values[ci];
      cell.value = v;
      bodyCell(cell, i, { align: col.align, fmt: col.fmt, wrap: col.wrap });
      if (col.kind === "receipt") {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = font({ bold: true, color: { argb: v === "✓" ? C.green : C.red } });
      }
      if (col.kind === "usd") cell.font = font({ bold: true });
    });
  });
  const usdIdx = cols.findIndex((c) => c.kind === "usd") + 1;
  const letter = ws.getColumn(usdIdx).letter;
  const first = startRow + 1;
  const last = startRow + Math.max(rows.length, 1);
  const totalRow = last + 1;

  if (rows.length === 0) {
    ws.mergeCells(first, 1, first, cols.length);
    const cell = ws.getCell(first, 1);
    cell.value = "No expenses to show.";
    cell.font = font({ color: { argb: C.muted } });
    cell.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(first).height = 26;
  }

  ws.getCell(totalRow, totalLabelCol).value = "Total (follows your filter)";
  ws.getCell(totalRow, usdIdx).value = { formula: `SUBTOTAL(109,${letter}${first}:${letter}${last})`, result: round2(sum(rows.map((r) => r.usd))) };
  ws.getCell(totalRow, usdIdx).numFmt = USD_FMT;
  ws.getCell(totalRow, usdIdx).alignment = { vertical: "middle", horizontal: "right" };
  totalRowStyle(ws, totalRow, 1, cols.length);
  ws.getCell(totalRow, totalLabelCol).alignment = { vertical: "middle", indent: 1 };

  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: last, column: cols.length } };
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  return totalRow;
}

const COL_DATE: LedgerCol = { header: "Date", width: 13, align: "left", fmt: DATE_FMT };
const COL_MERCHANT: LedgerCol = { header: "Merchant", width: 28 };
const COL_CATEGORY: LedgerCol = { header: "Category", width: 17 };
const COL_AMOUNT: LedgerCol = { header: "Amount", width: 13, align: "right", fmt: MONEY_FMT };
const COL_CURRENCY: LedgerCol = { header: "Currency", width: 10, align: "center" };
const COL_RATE: LedgerCol = { header: "Rate to USD", width: 12, align: "right", fmt: "0.0000" };
const COL_USD: LedgerCol = { header: "Amount USD", width: 14, align: "right", fmt: USD_FMT, kind: "usd" };
const COL_RECEIPT: LedgerCol = { header: "Receipt", width: 10, align: "center", kind: "receipt" };
const COL_NOTES: LedgerCol = { header: "Notes", width: 36, wrap: true };

/** The shared expense columns, in order, for one expense. `fallback` is the currency to assume when the row has none. */
function expenseValues(e: ExpenseRow, fallback: string) {
  return {
    date: excelDate(e.expense_date),
    merchant: e.merchant || "",
    category: e.category || "Other",
    amount: Number(e.amount),
    currency: e.currency || fallback,
    rate: e.exchange_rate != null ? Number(e.exchange_rate) : "",
    usd: usdOf(e, fallback),
    receipt: e.receipt_path ? "✓" : "–",
    notes: e.notes || "",
  };
}

/* ---------------------------------------------------- category breakdown */

/**
 * "Spending by category": name in columns c1..c1+1, amount in c1+3, share in c1+4, bar in the last two columns.
 * Returns the row after the total.
 */
function categoryBlock(ws: ExcelJS.Worksheet, top: number, cats: [string, number][], total: number): number {
  sectionTitle(ws, top, 2, 9, "Spending by category");
  const h = top + 1;
  ws.getRow(h).height = 24;
  for (let c = 2; c <= 9; c++) ws.getCell(h, c).fill = fill(C.brand);
  ws.mergeCells(h, 2, h, 3);
  ws.mergeCells(h, 8, h, 9);
  const head = (c: number, t: string, al?: Align) => {
    const cell = ws.getCell(h, c);
    cell.value = t;
    cell.font = font({ bold: true, color: { argb: C.white } });
    cell.alignment = { vertical: "middle", horizontal: al, indent: al ? 0 : 1 };
  };
  head(2, "Category");
  head(5, "Amount USD", "right");
  head(6, "Share", "right");

  const first = h + 1;
  const totalRow = first + Math.max(cats.length, 1);
  cats.forEach(([name, amt], i) => {
    const r = first + i;
    ws.getRow(r).height = 22;
    ws.mergeCells(r, 2, r, 3);
    ws.mergeCells(r, 8, r, 9);
    for (let c = 2; c <= 9; c++) bodyCell(ws.getCell(r, c), i);
    ws.getCell(r, 2).value = name;
    bodyCell(ws.getCell(r, 5), i, { align: "right", fmt: USD_FMT });
    ws.getCell(r, 5).value = round2(amt);
    bodyCell(ws.getCell(r, 6), i, { align: "right", fmt: "0.0%" });
    ws.getCell(r, 6).value = { formula: `IF(E${totalRow}=0,0,E${r}/E${totalRow})`, result: total ? amt / total : 0 };
    // The bar is a data bar on this cell; its number is hidden so only the bar shows.
    bodyCell(ws.getCell(r, 8), i, { align: "left", fmt: ";;;" });
    ws.getCell(r, 8).value = { formula: `F${r}`, result: total ? amt / total : 0 };
  });
  if (cats.length === 0) {
    ws.mergeCells(first, 2, first, 9);
    ws.getCell(first, 2).value = "No expenses yet.";
    ws.getCell(first, 2).font = font({ color: { argb: C.muted } });
    ws.getCell(first, 2).alignment = { vertical: "middle", indent: 1 };
  }
  ws.mergeCells(totalRow, 2, totalRow, 3);
  ws.getCell(totalRow, 2).value = "Total";
  ws.getCell(totalRow, 5).value = { formula: `SUM(E${first}:E${totalRow - 1})`, result: round2(total) };
  ws.getCell(totalRow, 5).numFmt = USD_FMT;
  ws.getCell(totalRow, 5).alignment = { vertical: "middle", horizontal: "right" };
  ws.getCell(totalRow, 6).value = { formula: `SUM(F${first}:F${totalRow - 1})`, result: cats.length ? 1 : 0 };
  ws.getCell(totalRow, 6).numFmt = "0.0%";
  ws.getCell(totalRow, 6).alignment = { vertical: "middle", horizontal: "right" };
  totalRowStyle(ws, totalRow, 2, 9);
  ws.getCell(totalRow, 2).alignment = { vertical: "middle", indent: 1 };
  if (cats.length) dataBar(ws, `H${first}:H${totalRow - 1}`, 1);
  return totalRow + 1;
}

function summaryColumns(ws: ExcelJS.Worksheet) {
  [2, 20, 16, 4, 20, 16, 4, 20, 16, 2].forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function footerNote(ws: ExcelJS.Worksheet, r: number, c: number) {
  const cell = ws.getCell(r, c);
  cell.value = `Prepared with Travel Expense Tracker  ·  ${longDate(todayISO())}`;
  cell.font = font({ size: 9, color: { argb: C.muted } });
}

/* ------------------------------------------------------------------ trip */

export async function buildTripWorkbook(trip: TripExportData): Promise<ExcelJS.Buffer> {
  const wb = newWorkbook();
  const rows = trip.expenses.map((e) => ({ e, usd: usdOf(e, trip.currency) }));
  const total = sum(rows.map((r) => r.usd));
  const n = rows.length;
  const withReceipt = trip.expenses.filter((e) => e.receipt_path).length;
  const endForDays = trip.end_date || trip.start_date;
  const days = Math.max(1, daysBetween(trip.start_date, endForDays) + 1);
  const period = periodText(trip.start_date, trip.end_date);
  const where = trip.destination ? `${trip.destination}  ·  ` : "";

  // Summary
  const s = sheet(wb, "Summary", C.brand);
  summaryColumns(s);
  band(s, 2, 9, "Trip expense report", trip.name, `${where}${period}`);
  s.getRow(4).height = 14;
  tile(s, 5, 2, 3, "TOTAL SPENT (USD)", round2(total), USD_FMT);
  tile(s, 5, 5, 6, "EXPENSES", n, "0");
  tile(s, 5, 8, 9, "PER DAY (USD)", round2(total / days), USD_FMT);
  s.getRow(7).height = 14;

  sectionTitle(s, 8, 2, 9, "Trip details");
  const details: [string, string][] = [];
  if (trip.userName) details.push(["Prepared by", trip.userName]);
  if (trip.companyName) details.push(["Company", trip.companyName]);
  details.push(["Status", trip.status.charAt(0).toUpperCase() + trip.status.slice(1)], ["Trip currency", trip.currency], ["Period", `${period}  (${days} ${days === 1 ? "day" : "days"})`], ["Receipts attached", `${withReceipt} of ${n}`]);
  details.forEach(([k, v], i) => {
    const r = 9 + i;
    s.getRow(r).height = 20;
    s.mergeCells(r, 2, r, 3);
    s.mergeCells(r, 5, r, 9);
    const a = s.getCell(r, 2);
    a.value = k;
    a.font = font({ color: { argb: C.muted } });
    a.alignment = { indent: 1, vertical: "middle" };
    const b = s.getCell(r, 5);
    b.value = v;
    b.font = font({ bold: true });
    b.alignment = { vertical: "middle" };
    for (let c = 2; c <= 9; c++) s.getCell(r, c).border = { bottom: hairline };
  });
  const next = categoryBlock(s, 9 + details.length + 1, categoryTotals(rows.map((r) => ({ category: r.e.category, usd: r.usd }))), total);
  footerNote(s, next + 1, 2);
  printSetup(s, { landscape: false, title: `${trip.name} · Summary` });

  // Expenses
  const ex = sheet(wb, "Expenses", "FF93C5FD", { state: "frozen", ySplit: 5, xSplit: 2 });
  const cols = [COL_DATE, COL_MERCHANT, COL_CATEGORY, COL_AMOUNT, COL_CURRENCY, COL_RATE, COL_USD, COL_RECEIPT, COL_NOTES];
  band(ex, 1, cols.length, "Expense ledger", trip.name, `${where}${period}  ·  ${n} ${n === 1 ? "expense" : "expenses"}`);
  ex.getRow(4).height = 8;
  ledger(
    ex,
    5,
    cols,
    rows.map(({ e, usd }) => {
      const v = expenseValues(e, trip.currency);
      return { values: [v.date, v.merchant, v.category, v.amount, v.currency, v.rate, v.usd, v.receipt, v.notes], usd };
    }),
    2
  );
  printSetup(ex, { landscape: true, title: `${trip.name} · Expenses`, repeat: "5:5" });

  return wb.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}

/* ------------------------------------------------------------------ year */

export async function buildYearlyWorkbook(params: {
  year: number;
  trips: TripExportData[];
  userName?: string;
  companyName?: string;
}): Promise<ExcelJS.Buffer> {
  const wb = newWorkbook();
  const { year, trips } = params;
  const all = trips.flatMap((t) => t.expenses.map((e) => ({ e, trip: t, usd: usdOf(e, t.currency) })));
  const grand = sum(all.map((r) => r.usd));
  const who = [params.userName ? `Prepared by ${params.userName}` : "", params.companyName || ""].filter(Boolean).join("  ·  ");
  const countText = `${trips.length} ${trips.length === 1 ? "trip" : "trips"}  ·  ${all.length} ${all.length === 1 ? "expense" : "expenses"}`;

  // Overview
  const o = sheet(wb, "Overview", C.brand);
  [2, 30, 22, 14, 14, 9, 11, 16, 12, 2].forEach((w, i) => (o.getColumn(i + 1).width = w));
  band(o, 2, 9, "Annual travel report", `${year} travel expenses`, [countText, who].filter(Boolean).join("  ·  "));
  o.getRow(4).height = 14;
  tile(o, 5, 2, 2, "TOTAL SPENT (USD)", round2(grand), USD_FMT);
  tile(o, 5, 3, 4, "TRIPS", trips.length, "0");
  tile(o, 5, 5, 7, "EXPENSES", all.length, "0");
  tile(o, 5, 8, 9, "AVERAGE PER TRIP", trips.length ? round2(grand / trips.length) : 0, USD_FMT);
  o.getRow(7).height = 14;

  sectionTitle(o, 8, 2, 9, "Trips");
  const tripAligns: (Align | undefined)[] = [undefined, undefined, "center", "center", "center", "center", "right", "right"];
  headerRow(o, 9, 2, ["Trip", "Destination", "Start", "End", "Days", "Expenses", "Total USD", "Share"], tripAligns);
  const firstTrip = 10;
  const tripTotalRow = firstTrip + Math.max(trips.length, 1);
  trips.forEach((t, i) => {
    const r = firstTrip + i;
    const tot = sum(t.expenses.map((e) => usdOf(e, t.currency)));
    const end = t.end_date || t.start_date;
    o.getRow(r).height = 22;
    const vals: (string | number | Date | ExcelJS.CellFormulaValue)[] = [
      t.name,
      t.destination || "",
      excelDate(t.start_date),
      excelDate(end),
      Math.max(1, daysBetween(t.start_date, end) + 1),
      t.expenses.length,
      round2(tot),
      { formula: `IF(H${tripTotalRow}=0,0,H${r}/H${tripTotalRow})`, result: grand ? tot / grand : 0 },
    ];
    const fmts = [undefined, undefined, DATE_FMT, DATE_FMT, "0", "0", USD_FMT, "0.0%"];
    vals.forEach((v, ci) => {
      const cell = o.getCell(r, 2 + ci);
      cell.value = v;
      bodyCell(cell, i, { align: tripAligns[ci], fmt: fmts[ci] });
    });
    o.getCell(r, 8).font = font({ bold: true });
  });
  if (trips.length === 0) {
    o.mergeCells(firstTrip, 2, firstTrip, 9);
    o.getCell(firstTrip, 2).value = `No trips started in ${year}.`;
    o.getCell(firstTrip, 2).font = font({ color: { argb: C.muted } });
    o.getCell(firstTrip, 2).alignment = { vertical: "middle", indent: 1 };
  }
  o.getCell(tripTotalRow, 2).value = "Total";
  o.getCell(tripTotalRow, 7).value = { formula: `SUM(G${firstTrip}:G${tripTotalRow - 1})`, result: all.length };
  o.getCell(tripTotalRow, 8).value = { formula: `SUM(H${firstTrip}:H${tripTotalRow - 1})`, result: round2(grand) };
  o.getCell(tripTotalRow, 8).numFmt = USD_FMT;
  o.getCell(tripTotalRow, 9).value = { formula: `SUM(I${firstTrip}:I${tripTotalRow - 1})`, result: trips.length ? 1 : 0 };
  o.getCell(tripTotalRow, 9).numFmt = "0.0%";
  o.getCell(tripTotalRow, 7).alignment = { horizontal: "center" };
  o.getCell(tripTotalRow, 8).alignment = { horizontal: "right" };
  o.getCell(tripTotalRow, 9).alignment = { horizontal: "right" };
  totalRowStyle(o, tripTotalRow, 2, 9);
  o.getCell(tripTotalRow, 2).alignment = { vertical: "middle", indent: 1 };

  // Category block: name, bar across the middle, total and share on the right.
  const cats = categoryTotals(all.map((r) => ({ category: r.e.category, usd: r.usd })));
  const cr = tripTotalRow + 2;
  sectionTitle(o, cr, 2, 9, "Spending by category");
  headerRow(o, cr + 1, 2, ["Category", "", "", "", "", "", "Total USD", "Share"], [undefined, undefined, undefined, undefined, undefined, undefined, "right", "right"]);
  const cFirst = cr + 2;
  cats.forEach(([name, amt], i) => {
    const r = cFirst + i;
    o.getRow(r).height = 22;
    o.mergeCells(r, 3, r, 7);
    for (let c = 2; c <= 9; c++) bodyCell(o.getCell(r, c), i);
    o.getCell(r, 2).value = name;
    bodyCell(o.getCell(r, 3), i, { align: "left", fmt: ";;;" });
    o.getCell(r, 3).value = { formula: `I${r}`, result: grand ? amt / grand : 0 };
    bodyCell(o.getCell(r, 8), i, { align: "right", fmt: USD_FMT });
    o.getCell(r, 8).value = round2(amt);
    bodyCell(o.getCell(r, 9), i, { align: "right", fmt: "0.0%" });
    o.getCell(r, 9).value = { formula: `IF($H$${tripTotalRow}=0,0,H${r}/$H$${tripTotalRow})`, result: grand ? amt / grand : 0 };
  });
  if (cats.length) dataBar(o, `C${cFirst}:C${cFirst + cats.length - 1}`, 1);
  footerNote(o, cFirst + Math.max(cats.length, 1) + 1, 2);
  printSetup(o, { landscape: true, title: `${year} travel expenses · Overview` });

  // By month
  const m = sheet(wb, "By month", "FF93C5FD");
  [2, 16, 12, 16, 40, 2].forEach((w, i) => (m.getColumn(i + 1).width = w));
  band(m, 2, 5, "Annual travel report", "Spending by month", String(year));
  m.getRow(4).height = 14;
  headerRow(m, 5, 2, ["Month", "Expenses", "Total USD", ""], [undefined, "center", "right", undefined]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const perMonth = months.map((mo) => {
    const rs = all.filter((r) => r.e.expense_date.startsWith(mo));
    return { count: rs.length, total: sum(rs.map((r) => r.usd)) };
  });
  const maxMonth = Math.max(0, ...perMonth.map((p) => p.total));
  months.forEach((mo, i) => {
    const r = 6 + i;
    m.getRow(r).height = 22;
    const p = perMonth[i];
    const vals: (Date | number)[] = [excelDate(`${mo}-01`), p.count, round2(p.total), round2(p.total)];
    const fmts = ["mmmm", "0", USD_FMT, ";;;"];
    const al: (Align | undefined)[] = [undefined, "center", "right", "left"];
    vals.forEach((v, ci) => {
      const cell = m.getCell(r, 2 + ci);
      cell.value = v;
      bodyCell(cell, i, { align: al[ci], fmt: fmts[ci] });
    });
    if (p.total === 0) {
      m.getCell(r, 3).font = font({ color: { argb: C.muted } });
      m.getCell(r, 4).font = font({ color: { argb: C.muted } });
    }
  });
  m.getCell(18, 2).value = "Total";
  m.getCell(18, 3).value = { formula: "SUM(C6:C17)", result: all.length };
  m.getCell(18, 4).value = { formula: "SUM(D6:D17)", result: round2(grand) };
  m.getCell(18, 4).numFmt = USD_FMT;
  m.getCell(18, 3).alignment = { horizontal: "center" };
  m.getCell(18, 4).alignment = { horizontal: "right" };
  totalRowStyle(m, 18, 2, 5);
  m.getCell(18, 2).alignment = { vertical: "middle", indent: 1 };
  dataBar(m, "E6:E17", maxMonth);
  printSetup(m, { landscape: false, title: `${year} travel expenses · By month` });

  // All expenses
  const a = sheet(wb, "All expenses", "FFBFDBFE", { state: "frozen", ySplit: 5, xSplit: 3 });
  const cols: LedgerCol[] = [{ header: "Trip", width: 26 }, COL_DATE, COL_MERCHANT, COL_CATEGORY, COL_AMOUNT, COL_CURRENCY, COL_RATE, COL_USD, COL_RECEIPT, COL_NOTES];
  band(a, 1, cols.length, "Annual travel report", `${year} · every expense`, `${all.length} ${all.length === 1 ? "expense" : "expenses"} across ${trips.length} ${trips.length === 1 ? "trip" : "trips"}`);
  a.getRow(4).height = 8;
  const sorted = [...all].sort((p, q) => p.e.expense_date.localeCompare(q.e.expense_date));
  ledger(
    a,
    5,
    cols,
    sorted.map(({ e, trip, usd }) => {
      const v = expenseValues(e, trip.currency);
      return { values: [trip.name, v.date, v.merchant, v.category, v.amount, v.currency, v.rate, v.usd, v.receipt, v.notes], usd };
    }),
    3
  );
  printSetup(a, { landscape: true, title: `${year} travel expenses · All expenses`, repeat: "5:5" });

  return wb.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}

/* ----------------------------------------------------------------- month */

export async function buildMonthlyWorkbook(params: {
  month: string; // YYYY-MM
  expenses: Array<ExpenseRow & { tripName: string; destination: string | null }>;
  userName?: string;
  companyName?: string;
}): Promise<ExcelJS.Buffer> {
  const wb = newWorkbook();
  const title = monthTitle(params.month);
  const rows = params.expenses.map((e) => ({ e, usd: usdOf(e, e.currency || "USD") }));
  const total = sum(rows.map((r) => r.usd));
  const tripCount = new Set(params.expenses.map((e) => e.tripName)).size;
  const who = [params.userName ? `Prepared by ${params.userName}` : "", params.companyName || ""].filter(Boolean).join("  ·  ");

  const s = sheet(wb, "Summary", C.brand);
  summaryColumns(s);
  band(s, 2, 9, "Monthly expense report", title, who || "Travel expenses");
  s.getRow(4).height = 14;
  tile(s, 5, 2, 3, "TOTAL SPENT (USD)", round2(total), USD_FMT);
  tile(s, 5, 5, 6, "EXPENSES", rows.length, "0");
  tile(s, 5, 8, 9, "TRIPS", tripCount, "0");
  s.getRow(7).height = 14;
  const next = categoryBlock(s, 8, categoryTotals(rows.map((r) => ({ category: r.e.category, usd: r.usd }))), total);
  footerNote(s, next + 1, 2);
  printSetup(s, { landscape: false, title: `${title} · Summary` });

  const ex = sheet(wb, "Expenses", "FF93C5FD", { state: "frozen", ySplit: 5, xSplit: 2 });
  const cols: LedgerCol[] = [COL_DATE, { header: "Trip", width: 26 }, { header: "Destination", width: 18 }, COL_MERCHANT, COL_CATEGORY, COL_AMOUNT, COL_CURRENCY, COL_RATE, COL_USD, COL_RECEIPT, COL_NOTES];
  band(ex, 1, cols.length, "Monthly expense report", `${title} · every expense`, `${rows.length} ${rows.length === 1 ? "expense" : "expenses"}`);
  ex.getRow(4).height = 8;
  ledger(
    ex,
    5,
    cols,
    rows.map(({ e, usd }) => {
      const v = expenseValues(e, "USD");
      return { values: [v.date, e.tripName || "", e.destination || "", v.merchant, v.category, v.amount, v.currency, v.rate, v.usd, v.receipt, v.notes], usd };
    }),
    2
  );
  printSetup(ex, { landscape: true, title: `${title} · Expenses`, repeat: "5:5" });

  return wb.xlsx.writeBuffer() as Promise<ExcelJS.Buffer>;
}
