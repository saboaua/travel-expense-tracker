/** What the Free plan allows and what only Pro has. The admin sets every number and switch; nothing here removes what people already saved. */

export type Limits = {
  /** The day the limits begin. Empty: they are off and everything works as before. */
  starts_on: string | null;
  free_ai_scans: number;
  free_documents: number;
  pro_documents: number;
  pro_bills_email: boolean;
  pro_telegram_save: boolean;
  pro_telegram_summary: boolean;
  pro_doc_reminders: boolean;
};
export type ProFeature = "bills_email" | "telegram_save" | "telegram_summary" | "doc_reminders";

export const DEFAULT_LIMITS: Limits = { starts_on: null, free_ai_scans: 10, free_documents: 2, pro_documents: 100, pro_bills_email: true, pro_telegram_save: true, pro_telegram_summary: true, pro_doc_reminders: true };
export const LIMITS_COLS = "starts_on, free_ai_scans, free_documents, pro_documents, pro_bills_email, pro_telegram_save, pro_telegram_summary, pro_doc_reminders";
export const FEATURE_FLAG: Record<ProFeature, keyof Limits> = { bills_email: "pro_bills_email", telegram_save: "pro_telegram_save", telegram_summary: "pro_telegram_summary", doc_reminders: "pro_doc_reminders" };
export const FEATURE_LABEL: Record<ProFeature, string> = { bills_email: "Bills by email", telegram_save: "Saving by chat on Telegram", telegram_summary: "Telegram summaries", doc_reminders: "Document expiry reminders" };

/** Who is asking: Pro and admins have everything the Free limits would hold back. */
export type Who = { pro: boolean; admin: boolean };

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Read rows from the database (numbers may arrive as strings; a missing row means the defaults). */
export function readLimits(row: Partial<Record<keyof Limits, unknown>> | null | undefined): Limits {
  const r = row ?? {};
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.max(0, Math.floor(Number(v))) : d);
  const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const D = DEFAULT_LIMITS;
  return { starts_on: isIso(r.starts_on) ? r.starts_on : null, free_ai_scans: n(r.free_ai_scans, D.free_ai_scans), free_documents: n(r.free_documents, D.free_documents), pro_documents: n(r.pro_documents, D.pro_documents), pro_bills_email: b(r.pro_bills_email, D.pro_bills_email), pro_telegram_save: b(r.pro_telegram_save, D.pro_telegram_save), pro_telegram_summary: b(r.pro_telegram_summary, D.pro_telegram_summary), pro_doc_reminders: b(r.pro_doc_reminders, D.pro_doc_reminders) };
}

/** Admin input. Returns the limits to save, or the sentence that says what to fix. */
export function parseLimits(body: Record<string, unknown>): { ok: true; value: Limits } | { ok: false; error: string } {
  const whole = (v: unknown, min: number, max: number) => { if (v === null || v === undefined || String(v).trim() === "") return null; const x = Number(v); return Number.isInteger(x) && x >= min && x <= max ? x : null; };
  const raw = typeof body.starts_on === "string" ? body.starts_on.trim() : "";
  if (raw && !isIso(raw)) return { ok: false, error: "Choose the day the limits begin, or leave it empty." };
  const scans = whole(body.free_ai_scans, 0, 1000), free = whole(body.free_documents, 0, 1000), pro = whole(body.pro_documents, 1, 10000);
  if (scans == null) return { ok: false, error: "AI scans for Free must be a whole number from 0 to 1000." };
  if (free == null) return { ok: false, error: "Documents on Free must be a whole number from 0 to 1000." };
  if (pro == null) return { ok: false, error: "Documents on Pro must be a whole number from 1 to 10000." };
  if (pro < free) return { ok: false, error: "Pro must hold at least as many documents as Free." };
  const flag = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const D = DEFAULT_LIMITS;
  return { ok: true, value: { starts_on: raw || null, free_ai_scans: scans, free_documents: free, pro_documents: pro, pro_bills_email: flag(body.pro_bills_email, D.pro_bills_email), pro_telegram_save: flag(body.pro_telegram_save, D.pro_telegram_save), pro_telegram_summary: flag(body.pro_telegram_summary, D.pro_telegram_summary), pro_doc_reminders: flag(body.pro_doc_reminders, D.pro_doc_reminders) } };
}

export const limitsActive = (l: Limits, today: string) => !!l.starts_on && l.starts_on <= today;

/** True when this person is held back from a Pro-only feature today. */
export function featureLocked(l: Limits, who: Who, feature: ProFeature, today: string): boolean {
  if (who.pro || who.admin) return false;
  return limitsActive(l, today) && l[FEATURE_FLAG[feature]] === true;
}

/** "2026-11" for a date. AI scans are counted per month. */
export const monthKey = (today: string) => today.slice(0, 7);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The first day of next month: "2026-12-01" and its words "1 December". */
export function nextMonth(today: string): { iso: string; label: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return { iso: `${ny}-${String(nm).padStart(2, "0")}-01`, label: `1 ${MONTHS[nm - 1]}` };
}

export type ScanStatus = { limited: boolean; limit: number; used: number; left: number; exhausted: boolean; resetsOn: string; resetsLabel: string };
/** AI scans this month. `limited` is false for Pro, admins and before the start day. */
export function scanStatus(l: Limits, who: Who, used: number, today: string): ScanStatus {
  const next = nextMonth(today);
  const limited = !who.pro && !who.admin && limitsActive(l, today);
  const limit = l.free_ai_scans;
  const u = Math.max(0, Math.floor(used || 0));
  return { limited, limit, used: u, left: limited ? Math.max(0, limit - u) : Infinity, exhausted: limited && u >= limit, resetsOn: next.iso, resetsLabel: next.label };
}

export type DocStatus = { limit: number | null; count: number; full: boolean };
/** How many documents this person may hold. null: no limit (admins, and everyone before the start day). */
export function docStatus(l: Limits, who: Who, count: number, today: string): DocStatus {
  const c = Math.max(0, Math.floor(count || 0));
  if (who.admin || !limitsActive(l, today)) return { limit: null, count: c, full: false };
  const limit = who.pro ? l.pro_documents : l.free_documents;
  return { limit, count: c, full: c >= limit };
}

/** The "What you get" table on the Get Pro page: one row per difference between Free and Pro. */
export function proComparison(l: Limits): { label: string; free: string; pro: string }[] {
  const rows = [{ label: "AI receipt scans", free: `${l.free_ai_scans} a month`, pro: "No limit" }];
  if (l.pro_bills_email) rows.push({ label: "Bills by email", free: "No", pro: "Yes" });
  if (l.pro_telegram_save) rows.push({ label: "Telegram: save by chat", free: "No", pro: "Yes" });
  if (l.pro_telegram_summary) rows.push({ label: "Telegram: summaries", free: "No", pro: "Yes" });
  rows.push({ label: "Documents", free: String(l.free_documents), pro: String(l.pro_documents) });
  if (l.pro_doc_reminders) rows.push({ label: "Expiry reminders", free: "No", pro: "Yes" });
  rows.push({ label: "Excel and PDF reports", free: "No", pro: "Yes" });
  return rows;
}
