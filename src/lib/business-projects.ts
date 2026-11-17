import { formatCurrency } from "@/lib/utils";
import type { ReportData, ReportLogo } from "@/lib/report-export";

/** Business projects: a client, an optional budget, and the receipts spent on them. */

export type BizProject = {
  id: string;
  name: string;
  client_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  reference: string | null;
  budget: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "done";
  notes: string | null;
};
export const PROJECT_COLS = "id, name, client_name, contact_name, contact_email, contact_phone, reference, budget, currency, start_date, end_date, status, notes";

export type BizReceipt = { id: string; merchant: string | null; amount: number | string; currency: string | null; amount_usd: number | string | null; category: string | null; expense_date: string; notes: string | null; receipt_path: string | null };
export const RECEIPT_COLS = "id, merchant, amount, currency, amount_usd, category, expense_date, notes, receipt_path";

export type ProjectInput = Omit<BizProject, "id" | "status"> & { status?: "active" | "done" };

const clean = (v: unknown, max: number): string | null => { const t = typeof v === "string" ? v.trim() : ""; return t ? t.slice(0, max) : null; };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** What a person typed on the project form, checked. Returns the row to save or the sentence that says what to fix. */
export function parseProject(raw: Record<string, unknown>): { ok: true; value: ProjectInput } | { ok: false; error: string } {
  const name = clean(raw.name, 120);
  if (!name) return { ok: false, error: "Give the project a name." };
  const email = clean(raw.contact_email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email address does not look right." };
  const budgetText = typeof raw.budget === "number" ? String(raw.budget) : typeof raw.budget === "string" ? raw.budget.trim().replace(/,/g, "") : "";
  let budget: number | null = null;
  if (budgetText) {
    budget = Number(budgetText);
    if (!Number.isFinite(budget) || budget < 0) return { ok: false, error: "The budget must be a number, or leave it empty." };
    budget = Math.round(budget * 100) / 100;
  }
  const start = raw.start_date ? String(raw.start_date) : null, end = raw.end_date ? String(raw.end_date) : null;
  if (start && !isDay(start)) return { ok: false, error: "Choose a valid start date." };
  if (end && !isDay(end)) return { ok: false, error: "Choose a valid end date." };
  if (start && end && end < start) return { ok: false, error: "The end date is before the start date." };
  const currency = typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : "USD";
  return { ok: true, value: { name, client_name: clean(raw.client_name, 120), contact_name: clean(raw.contact_name, 120), contact_email: email, contact_phone: clean(raw.contact_phone, 160), reference: clean(raw.reference, 80), budget, currency, start_date: start, end_date: end, notes: clean(raw.notes, 1000) } };
}

/** The dollar value of one receipt: its saved USD amount, or the amount itself when it is in USD. Null when it cannot be counted. */
export function receiptUsd(r: Pick<BizReceipt, "amount" | "currency" | "amount_usd">): number | null {
  if (r.amount_usd != null && r.amount_usd !== "") return Number(r.amount_usd);
  if (!r.currency || r.currency === "USD") return Number(r.amount);
  return null;
}

export type ProjectTotals = { total: number; count: number; uncounted: number; byCategory: [string, number][]; budgetLeft: number | null; pct: number | null };
export function projectTotals(receipts: Pick<BizReceipt, "amount" | "currency" | "amount_usd" | "category">[], budget: number | null): ProjectTotals {
  const by = new Map<string, number>();
  let total = 0, uncounted = 0;
  for (const r of receipts) {
    const v = receiptUsd(r);
    if (v == null) { uncounted++; continue; }
    total += v;
    const c = r.category || "Other";
    by.set(c, (by.get(c) ?? 0) + v);
  }
  total = Math.round(total * 100) / 100;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total, count: receipts.length, uncounted,
    byCategory: [...by.entries()].map(([k, v]) => [k, round(v)] as [string, number]).sort((a, b) => b[1] - a[1]),
    budgetLeft: budget != null ? round(budget - total) : null,
    pct: budget != null && budget > 0 ? Math.round((total / budget) * 100) : null,
  };
}

/** How many projects count toward the Free and Pro limit. */
export const activeCount = (projects: Pick<BizProject, "status">[]) => projects.filter((p) => p.status === "active").length;

/** One line for the client block at the top of a report. */
export function clientLines(p: Pick<BizProject, "client_name" | "contact_name" | "contact_email" | "contact_phone" | "reference">): string[] {
  const out: string[] = [];
  if (p.client_name) out.push(`Client: ${p.client_name}`);
  const who = [p.contact_name, p.contact_email].filter(Boolean).join(" · ");
  if (who) out.push(who);
  if (p.contact_phone) out.push(p.contact_phone);
  if (p.reference) out.push(`Reference: ${p.reference}`);
  return out;
}

/** The Excel and PDF report of one project, in the same engine as every other report. */
export function bizProjectReport(p: BizProject, receipts: BizReceipt[], brand: { company?: string | null; logo?: ReportLogo | null; ownerName?: string }): ReportData {
  const t = projectTotals(receipts, p.budget);
  const lines = [...receipts].sort((a, b) => a.expense_date.localeCompare(b.expense_date));
  const period = p.start_date ? `${p.start_date}${p.end_date ? ` to ${p.end_date}` : ""}` : null;
  const subtitle = [...clientLines(p), period, p.budget != null ? `Budget ${formatCurrency(p.budget, "USD")}` : null, brand.ownerName ? `Prepared by ${brand.ownerName}` : null].filter(Boolean).join(" - ");
  const summary: [string, number][] = [...t.byCategory];
  if (t.budgetLeft != null) summary.push(["Budget left", t.budgetLeft]);
  return {
    title: p.name,
    subtitle: subtitle || undefined,
    company: brand.company, logo: brand.logo,
    columns: [
      { header: "Date", key: "date", width: 13, kind: "date" },
      { header: "Store", key: "merchant", width: 26, kind: "text" },
      { header: "Category", key: "category", width: 16, kind: "text" },
      { header: "Amount", key: "amount", width: 14, kind: "money", currencyKey: "currency" },
      { header: "In USD", key: "usd", width: 14, kind: "money", currency: "USD" },
    ],
    rows: lines.map((r) => ({ date: r.expense_date, merchant: r.merchant || "", category: r.category || "Other", amount: Number(r.amount), currency: r.currency || "USD", usd: receiptUsd(r) })),
    total: { label: "Total spent", value: t.total, currency: "USD" },
    summaryTitle: "By category", summary, summaryCurrency: "USD",
    note: t.uncounted ? `${t.uncounted} receipt${t.uncounted === 1 ? " was" : "s were"} left out of the total because it has no USD value.` : undefined,
  };
}
