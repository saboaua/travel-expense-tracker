import { formatCurrency } from "@/lib/utils";
import { buildReportPdf, buildReportWorkbook, reportFileName, type ReportData, type ReportLogo } from "@/lib/report-export";

export type ProjectExportLine = { date: string; merchant: string; category: string; amount: number; currency: string; usd: number; notes: string };
export type ProjectExportData = { name: string; typeLabel: string; budget: number | null; currency: string; status: string; lines: ProjectExportLine[]; ownerName?: string; company?: string | null; logo?: ReportLogo | null };

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

export const projectFileName = (name: string, ext: "xlsx" | "pdf") => reportFileName(name, "expenses", ext);

export function projectReport(d: ProjectExportData): ReportData {
  const { usd, byCategory } = projectTotals(d.lines);
  return {
    title: d.name,
    subtitle: `${d.typeLabel} project${d.ownerName ? ` - ${d.ownerName}` : ""}${d.budget ? ` - budget ${formatCurrency(d.budget, d.currency)}` : ""}`,
    company: d.company, logo: d.logo,
    columns: [
      { header: "Date", key: "date", width: 13, kind: "date" },
      { header: "Merchant", key: "merchant", width: 26, kind: "text" },
      { header: "Category", key: "category", width: 18, kind: "text" },
      { header: "Amount", key: "amount", width: 14, kind: "money", currencyKey: "currency" },
      { header: "Amount (USD)", key: "usd", width: 14, kind: "money", currency: "USD" },
      { header: "Notes", key: "notes", width: 30, kind: "text" },
    ],
    rows: d.lines.map((l) => ({ ...l })),
    total: { label: "Total spent", value: usd, currency: "USD" },
    summaryTitle: "By category", summary: byCategory, summaryCurrency: "USD",
  };
}

export const buildProjectWorkbook = (d: ProjectExportData) => buildReportWorkbook(projectReport(d));
export const buildProjectPdf = (d: ProjectExportData) => buildReportPdf(projectReport(d));
