import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSettings, EMPTY_SETTINGS, isProgram, type AccountSettings, type ProgramId, type SourceExpense } from "@/lib/accounting";
import { isMonth } from "@/lib/report-server";

export type Scope = { scope: string; id?: string | null; year?: string | null; month?: string | null };
export type Loaded = { label: string; prefix: string; items: SourceExpense[] } | { error: string; status: number };

const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: unknown): number | null => { const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
type Row = { id: string; merchant: string | null; amount: number | string; currency: string | null; exchange_rate?: number | string | null; amount_usd: number | string | null; category: string | null; expense_date: string };
const map = (source: "expense" | "receipt") => (r: Row): SourceExpense => ({ key: `${source}:${r.id}`, source, id: r.id, date: r.expense_date, merchant: r.merchant, category: r.category, amount: num(r.amount) ?? 0, currency: r.currency, amountUsd: num(r.amount_usd), rate: num(r.exchange_rate) });

/** The expenses a trip, a year, a month or a business project holds, ready to book. */
export async function loadExpenses(db: SupabaseClient, userId: string, q: Scope): Promise<Loaded> {
  if (q.scope === "trip") {
    if (!q.id || !UUID.test(q.id)) return { error: "Choose a trip.", status: 400 };
    const { data: trip } = await db.from("trips").select("name").eq("id", q.id).eq("user_id", userId).maybeSingle();
    if (!trip) return { error: "Trip not found", status: 404 };
    const { data } = await db.from("expenses").select("id, merchant, amount, currency, exchange_rate, amount_usd, category, expense_date").eq("trip_id", q.id).eq("user_id", userId).limit(5000);
    return { label: (trip as { name: string }).name, prefix: "TRIP", items: ((data ?? []) as unknown as Row[]).map(map("expense")) };
  }
  if (q.scope === "bproject") {
    if (!q.id || !UUID.test(q.id)) return { error: "Choose a project.", status: 400 };
    const { data: p } = await db.from("business_projects").select("name").eq("id", q.id).eq("user_id", userId).maybeSingle();
    if (!p) return { error: "Project not found", status: 404 };
    const { data } = await db.from("business_project_receipts").select("id, merchant, amount, currency, amount_usd, category, expense_date").eq("project_id", q.id).eq("user_id", userId).limit(5000);
    return { label: (p as { name: string }).name, prefix: "PRJ", items: ((data ?? []) as unknown as Row[]).map(map("receipt")) };
  }
  let from = "", to = "", label = "";
  if (q.scope === "year" && q.year && /^\d{4}$/.test(q.year)) { from = `${q.year}-01-01`; to = `${q.year}-12-31`; label = `Business expenses ${q.year}`; }
  else if (q.scope === "month" && isMonth(q.month)) {
    const last = new Date(Date.UTC(Number(q.month.slice(0, 4)), Number(q.month.slice(5, 7)), 0)).getUTCDate();
    from = `${q.month}-01`; to = `${q.month}-${String(last).padStart(2, "0")}`; label = `Business expenses ${q.month}`;
  } else return { error: "Choose a trip, project, year or month.", status: 400 };
  const { data } = await db.from("expenses").select("id, merchant, amount, currency, exchange_rate, amount_usd, category, expense_date").eq("user_id", userId).gte("expense_date", from).lte("expense_date", to).order("expense_date").limit(5000);
  return { label, prefix: "EXP", items: ((data ?? []) as unknown as Row[]).map(map("expense")) };
}

/** Saved accounts. Before the migration runs (or with nothing saved) this is empty. */
export async function loadAccountSettings(db: SupabaseClient, userId: string): Promise<{ settings: AccountSettings; program: ProgramId | null; ready: boolean }> {
  const { data, error } = await db.from("accounting_settings").select("program, credit_code, credit_name, accounts").eq("user_id", userId).maybeSingle();
  if (error) return { settings: EMPTY_SETTINGS, program: null, ready: false };
  if (!data) return { settings: EMPTY_SETTINGS, program: null, ready: true };
  const d = data as { program: string | null };
  return { settings: cleanSettings(data), program: isProgram(d.program) ? d.program : null, ready: true };
}

export async function exportedKeys(db: SupabaseClient, userId: string, items: SourceExpense[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const source of ["expense", "receipt"] as const) {
    const ids = items.filter((i) => i.source === source).map((i) => i.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from("accounting_exports").select("ref").eq("user_id", userId).eq("source", source).in("ref", ids.slice(i, i + 200));
      if (error) return out;
      for (const r of (data ?? []) as { ref: string }[]) out.add(`${source}:${r.ref}`);
    }
  }
  return out;
}

export async function markExported(db: SupabaseClient, userId: string, items: SourceExpense[], program: ProgramId): Promise<void> {
  const rows = items.map((i) => ({ user_id: userId, source: i.source, ref: i.id, program, exported_at: new Date().toISOString() }));
  for (let i = 0; i < rows.length; i += 500) await db.from("accounting_exports").upsert(rows.slice(i, i + 500), { onConflict: "user_id,source,ref" });
}
