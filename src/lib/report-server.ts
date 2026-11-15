import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS, PERSONAL_PROJECT_COLS_TYPED, withColumnFallback } from "@/lib/columns";
import { convert } from "@/lib/personal/money";
import { fetchMonthRaw, monthReport } from "@/lib/personal/month-report";
import { resolveType } from "@/lib/personal/project-types";
import { projectLines, projectReport } from "@/lib/project-export";
import { logoType, reportFileName, type ReportData, type ReportLogo } from "@/lib/report-export";

export type ReportParams = { scope: string; month?: string | null; id?: string | null; logo: boolean };
export type ReportResult = { data: ReportData; file: string } | { error: string; status: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const REPORT_CURRENCY = "AWG" as const;
const monthTitle = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The company name and logo from the profile. An unreadable or missing logo is simply left out. */
export async function loadBranding(supabase: SupabaseClient, userId: string, wantLogo: boolean): Promise<{ company: string | null; ownerName?: string; logo: ReportLogo | null }> {
  let res = await supabase.from("profiles").select("company_name, first_name, last_name, full_name, business_logo_path").eq("id", userId).single();
  if (res.error) res = (await supabase.from("profiles").select("company_name, first_name, last_name, full_name").eq("id", userId).single()) as typeof res;
  const p = res.data as { company_name?: string | null; first_name?: string | null; last_name?: string | null; full_name?: string | null; business_logo_path?: string | null } | null;
  const ownerName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.full_name || undefined;
  let logo: ReportLogo | null = null;
  if (wantLogo && p?.business_logo_path && p.business_logo_path.startsWith(`${userId}/`) && !p.business_logo_path.includes("..")) {
    const dl = await supabase.storage.from("receipts").download(p.business_logo_path);
    if (!dl.error && dl.data && dl.data.size <= 1_500_000) {
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const type = logoType(bytes);
      if (type) logo = { bytes, type };
    }
  }
  return { company: wantLogo ? p?.company_name || null : null, ownerName, logo };
}

export async function buildReport(supabase: SupabaseClient, userId: string, q: ReportParams): Promise<ReportResult> {
  const brand = await loadBranding(supabase, userId, q.logo);
  const base = { company: brand.company, logo: brand.logo };

  if (q.scope === "project") {
    if (!q.id || !/^[0-9a-f-]{36}$/i.test(q.id)) return { error: "Choose a project.", status: 400 };
    const { data: project } = await withColumnFallback((cols) => supabase.from("personal_projects").select(cols).eq("id", q.id!).eq("user_id", userId).single(), PERSONAL_PROJECT_COLS_TYPED, PERSONAL_PROJECT_COLS);
    if (!project) return { error: "Project not found", status: 404 };
    const p = project as unknown as { name: string; budget: number | null; currency: string; status: string; project_type?: string | null; type_label?: string | null; type_icon?: string | null; type_color?: string | null };
    const [exp, spends] = await Promise.all([
      supabase.from("personal_expenses").select(PERSONAL_EXPENSE_COLS).eq("project_id", q.id).eq("user_id", userId),
      supabase.from("personal_spends").select("merchant, amount, currency, amount_usd, category, expense_date, notes").eq("project_id", q.id).eq("user_id", userId),
    ]);
    const lines = projectLines((exp.data as never[]) ?? [], (spends.error ? [] : (spends.data as never[])) ?? []);
    return { data: projectReport({ name: p.name, typeLabel: resolveType(p).label, budget: p.budget != null ? Number(p.budget) : null, currency: p.currency, status: p.status, lines, ownerName: brand.ownerName, ...base }), file: "expenses" + "|" + p.name };
  }

  if (!isMonth(q.month)) return { error: "Choose a month.", status: 400 };
  const month = q.month, start = `${month}-01`, end = `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;

  if (q.scope === "month") {
    const raw = await fetchMonthRaw(supabase, start, userId);
    const r = monthReport(raw, REPORT_CURRENCY, start);
    return {
      file: `overview|${month}`,
      data: {
        title: `Expense overview, ${monthTitle(month)}`, subtitle: brand.ownerName ? `${brand.ownerName} - amounts in ${REPORT_CURRENCY}` : `Amounts in ${REPORT_CURRENCY}`, ...base,
        columns: [
          { header: "Date", key: "date", width: 13, kind: "date" },
          { header: "Area", key: "area", width: 16, kind: "text" },
          { header: "What", key: "name", width: 30, kind: "text" },
          { header: "Category", key: "category", width: 18, kind: "text" },
          { header: "Amount", key: "amount", width: 14, kind: "money", currency: REPORT_CURRENCY },
        ],
        rows: r.lines.map((l) => ({ ...l })),
        total: { label: "Total spent", value: r.total, currency: REPORT_CURRENCY },
        summaryTitle: "By area", summary: r.byArea, summaryCurrency: REPORT_CURRENCY,
        note: r.uncounted ? `${r.uncounted} entr${r.uncounted === 1 ? "y was" : "ies were"} left out because the currency could not be converted. Utilities count in the month they were paid.` : "Utilities count in the month they were paid.",
      },
    };
  }

  if (q.scope === "groceries") {
    type R = { id: string; store: string | null; purchase_date: string; currency: string; prices_only?: boolean | null };
    const rc = await withColumnFallback((cols) => supabase.from("grocery_receipts").select(cols).eq("user_id", userId).gte("purchase_date", start).lte("purchase_date", end).limit(2000), "id, store, purchase_date, currency, prices_only", "id, store, purchase_date, currency");
    const receipts = ((rc.data ?? []) as unknown as R[]).filter((r) => !r.prices_only);
    const byId = new Map(receipts.map((r) => [r.id, r]));
    const res = receipts.length ? await supabase.from("grocery_items").select("receipt_id, name, category, quantity, line_total").eq("user_id", userId).in("receipt_id", [...byId.keys()]).limit(5000) : { data: [], error: null };
    const items = ((res.error ? [] : res.data) as unknown as { receipt_id: string; name: string; category: string | null; quantity: number | string | null; line_total: number | string }[])
      .map((i) => ({ ...i, rc: byId.get(i.receipt_id)! }))
      .filter((i) => i.rc);
    let uncounted = 0;
    const rows = items.flatMap((i) => {
      const v = convert(Number(i.line_total), i.rc.currency, REPORT_CURRENCY);
      if (v == null) { uncounted++; return []; }
      return [{ date: i.rc.purchase_date, store: i.rc.store || "", name: i.name, category: i.category || "Other", qty: i.quantity == null ? null : Number(i.quantity), amount: Math.round(v * 100) / 100 }];
    }).sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store));
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.category, (by.get(r.category) ?? 0) + r.amount);
    const total = Math.round(rows.reduce((t, r) => t + r.amount, 0) * 100) / 100;
    return {
      file: `groceries|${month}`,
      data: {
        title: `Groceries, ${monthTitle(month)}`, subtitle: brand.ownerName ? `${brand.ownerName} - amounts in ${REPORT_CURRENCY}` : `Amounts in ${REPORT_CURRENCY}`, ...base,
        columns: [
          { header: "Date", key: "date", width: 13, kind: "date" },
          { header: "Store", key: "store", width: 18, kind: "text" },
          { header: "Item", key: "name", width: 32, kind: "text" },
          { header: "Category", key: "category", width: 16, kind: "text" },
          { header: "Qty", key: "qty", width: 7, kind: "number" },
          { header: "Amount", key: "amount", width: 14, kind: "money", currency: REPORT_CURRENCY },
        ],
        rows, total: { label: "Total", value: Math.round(total * 100) / 100, currency: REPORT_CURRENCY },
        summaryTitle: "By category", summary: [...by.entries()].map(([k, v]) => [k, Math.round(v * 100) / 100] as [string, number]).sort((a, b) => b[1] - a[1]), summaryCurrency: REPORT_CURRENCY,
        note: uncounted ? `${uncounted} item${uncounted === 1 ? " was" : "s were"} left out because the currency could not be converted.` : undefined,
      },
    };
  }
  return { error: "Unknown report", status: 404 };
}

/** "expenses|Name" or "overview|2026-11" becomes the file name. */
export const fileNameFor = (file: string, ext: "xlsx" | "pdf") => { const [kind, rest] = file.split("|"); return kind === "expenses" ? reportFileName(rest, "expenses", ext) : reportFileName(kind, rest, ext); };
