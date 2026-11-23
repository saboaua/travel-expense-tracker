import { isMissingColumn } from "@/lib/columns";
/** What the Free plan allows and what only Pro has. The admin sets every number and switch; nothing here removes what people already saved. */

export type LimitKey = "ai_scans" | "documents" | "bills_email" | "telegram_save" | "telegram_summary" | "doc_reminders" | "card_sharing" | "trip_papers" | "projects" | "trip_reports";
export const LIMIT_KEYS: LimitKey[] = ["ai_scans", "documents", "bills_email", "telegram_save", "telegram_summary", "doc_reminders", "card_sharing", "trip_papers", "projects", "trip_reports"];
export type Limits = {
  /** The day each limit begins. Empty: that limit is off and everything works as before. */
  starts: Record<LimitKey, string | null>;
  free_ai_scans: number;
  free_documents: number;
  pro_documents: number;
  free_shared_cards: number;
  free_trip_papers: number;
  pro_trip_papers: number;
  /** Business projects that are active at the same time. */
  free_projects: number;
  pro_projects: number;
};
export type ProFeature = "bills_email" | "telegram_save" | "telegram_summary" | "doc_reminders" | "trip_reports";

const NO_STARTS = Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])) as Record<LimitKey, string | null>;
/** Business projects are limited from the start (2 active on Free); the admin can switch it off or move the day. */
export const DEFAULT_LIMITS: Limits = { starts: { ...NO_STARTS, projects: "2026-01-01" }, free_ai_scans: 10, free_documents: 2, pro_documents: 100, free_shared_cards: 1, free_trip_papers: 3, pro_trip_papers: 50, free_projects: 2, pro_projects: 50 };
export const startCol = (k: LimitKey) => `starts_${k}`;
export const LIMITS_COLS = [...LIMIT_KEYS.map(startCol), "free_ai_scans", "free_documents", "pro_documents", "free_shared_cards", "free_trip_papers", "pro_trip_papers", "free_projects", "pro_projects"].join(", ");
export const LIMIT_LABEL: Record<LimitKey, string> = { ai_scans: "AI receipt scans", documents: "Documents", bills_email: "Bills by email", telegram_save: "Saving by chat on Telegram", telegram_summary: "Telegram summaries", doc_reminders: "Document expiry reminders", card_sharing: "Sharing loyalty cards", trip_papers: "Trip papers", projects: "Business projects", trip_reports: "Business trip reports" };
export const FEATURE_LABEL: Record<ProFeature, string> = { bills_email: LIMIT_LABEL.bills_email, telegram_save: LIMIT_LABEL.telegram_save, telegram_summary: LIMIT_LABEL.telegram_summary, doc_reminders: LIMIT_LABEL.doc_reminders, trip_reports: LIMIT_LABEL.trip_reports };

/** Who is asking: Pro and admins have everything the Free limits would hold back. */
export type Who = { pro: boolean; admin: boolean };

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Read rows from the database (numbers may arrive as strings; a missing row means the defaults). */
export function readLimits(row: Record<string, unknown> | null | undefined): Limits {
  if (!row) return DEFAULT_LIMITS;
  const r = row;
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.max(0, Math.floor(Number(v))) : d);
  const D = DEFAULT_LIMITS;
  const starts = { ...NO_STARTS };
  for (const k of LIMIT_KEYS) { const c = startCol(k); starts[k] = !(c in r) ? D.starts[k] : isIso(r[c]) ? (r[c] as string) : null; }
  return { starts, free_ai_scans: n(r.free_ai_scans, D.free_ai_scans), free_documents: n(r.free_documents, D.free_documents), pro_documents: n(r.pro_documents, D.pro_documents), free_shared_cards: n(r.free_shared_cards, D.free_shared_cards), free_trip_papers: n(r.free_trip_papers, D.free_trip_papers), pro_trip_papers: n(r.pro_trip_papers, D.pro_trip_papers), free_projects: n(r.free_projects, D.free_projects), pro_projects: n(r.pro_projects, D.pro_projects) };
}

/** What goes into the table: the start columns and the numbers. */
export function limitsRow(l: Limits): Record<string, unknown> {
  const out: Record<string, unknown> = { free_ai_scans: l.free_ai_scans, free_documents: l.free_documents, pro_documents: l.pro_documents, free_shared_cards: l.free_shared_cards, free_trip_papers: l.free_trip_papers, pro_trip_papers: l.pro_trip_papers, free_projects: l.free_projects, pro_projects: l.pro_projects };
  for (const k of LIMIT_KEYS) out[startCol(k)] = l.starts[k];
  return out;
}

/**
 * Reads the limits row. When a newer column does not exist yet (the code is live before its migration is run) that one column is left out and
 * read as its default; every other saved setting is still read, so an update never turns the saved settings into defaults.
 */
export async function selectLimits(run: (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<{ data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }> {
  const cols = LIMITS_COLS.split(", ");
  for (let i = 0; i <= cols.length; i++) {
    const res = await run(cols.join(", "));
    if (!isMissingColumn(res.error)) return { data: (res.data ?? null) as Record<string, unknown> | null, error: res.error };
    const m = /column\s+(?:\w+\.)?"?(\w+)"?\s+does not exist/i.exec(res.error?.message ?? "") ?? /find the '(\w+)' column/i.exec(res.error?.message ?? "");
    const at = m ? cols.indexOf(m[1]) : -1;
    if (at < 0) return { data: null, error: res.error };
    cols.splice(at, 1);
  }
  return { data: null, error: { message: "could not read the limits" } };
}

/** Fill what an admin form left out with what is saved, so an old page or a new setting never writes defaults over saved settings. */
export function mergeLimitsBody(current: Limits, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...limitsRow(current), ...Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== "starts" && v !== undefined)) };
  const given = body.starts && typeof body.starts === "object" ? (body.starts as Record<string, unknown>) : {};
  const starts: Record<string, unknown> = {};
  for (const k of LIMIT_KEYS) starts[k] = k in given ? given[k] : current.starts[k];
  return { ...out, starts };
}

/** Admin input. Returns the limits to save, or the sentence that says what to fix. */
export function parseLimits(body: Record<string, unknown>): { ok: true; value: Limits } | { ok: false; error: string } {
  const whole = (v: unknown, min: number, max: number) => { if (v === null || v === undefined || String(v).trim() === "") return null; const x = Number(v); return Number.isInteger(x) && x >= min && x <= max ? x : null; };
  const given = body.starts && typeof body.starts === "object" ? (body.starts as Record<string, unknown>) : {};
  const starts = { ...NO_STARTS };
  for (const k of LIMIT_KEYS) {
    const raw = typeof given[k] === "string" ? (given[k] as string).trim() : "";
    if (raw && !isIso(raw)) return { ok: false, error: `Choose a start day for ${LIMIT_LABEL[k]}, or switch it off.` };
    starts[k] = raw || null;
  }
  const scans = whole(body.free_ai_scans, 0, 1000), free = whole(body.free_documents, 0, 1000), pro = whole(body.pro_documents, 1, 10000);
  const shared = whole(body.free_shared_cards, 0, 1000), pfree = whole(body.free_trip_papers, 0, 1000), ppro = whole(body.pro_trip_papers, 1, 10000);
  const jfree = whole(body.free_projects ?? DEFAULT_LIMITS.free_projects, 0, 1000), jpro = whole(body.pro_projects ?? DEFAULT_LIMITS.pro_projects, 1, 10000);
  if (scans == null) return { ok: false, error: "AI scans for Free must be a whole number from 0 to 1000." };
  if (free == null) return { ok: false, error: "Documents on Free must be a whole number from 0 to 1000." };
  if (pro == null) return { ok: false, error: "Documents on Pro must be a whole number from 1 to 10000." };
  if (pro < free) return { ok: false, error: "Pro must hold at least as many documents as Free." };
  if (shared == null) return { ok: false, error: "Shared cards on Free must be a whole number from 0 to 1000." };
  if (pfree == null) return { ok: false, error: "Trip papers on Free must be a whole number from 0 to 1000." };
  if (ppro == null) return { ok: false, error: "Trip papers on Pro must be a whole number from 1 to 10000." };
  if (ppro < pfree) return { ok: false, error: "Pro must hold at least as many trip papers as Free." };
  if (jfree == null) return { ok: false, error: "Projects on Free must be a whole number from 0 to 1000." };
  if (jpro == null) return { ok: false, error: "Projects on Pro must be a whole number from 1 to 10000." };
  if (jpro < jfree) return { ok: false, error: "Pro must hold at least as many projects as Free." };
  return { ok: true, value: { starts, free_ai_scans: scans, free_documents: free, pro_documents: pro, free_shared_cards: shared, free_trip_papers: pfree, pro_trip_papers: ppro, free_projects: jfree, pro_projects: jpro } };
}

/** True when this one limit is on today. */
export const limitOn = (l: Limits, k: LimitKey, today: string) => !!l.starts[k] && (l.starts[k] as string) <= today;
/** True when at least one limit is on today. */
export const limitsActive = (l: Limits, today: string) => LIMIT_KEYS.some((k) => limitOn(l, k, today));
/** True when at least one limit has a start day (now or later). */
export const limitsSet = (l: Limits) => LIMIT_KEYS.some((k) => !!l.starts[k]);

/** True when this person is held back from a Pro-only feature today. */
export function featureLocked(l: Limits, who: Who, feature: ProFeature, today: string): boolean {
  if (who.pro || who.admin) return false;
  return limitOn(l, feature, today);
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
  const limited = !who.pro && !who.admin && limitOn(l, "ai_scans", today);
  const limit = l.free_ai_scans;
  const u = Math.max(0, Math.floor(used || 0));
  return { limited, limit, used: u, left: limited ? Math.max(0, limit - u) : Infinity, exhausted: limited && u >= limit, resetsOn: next.iso, resetsLabel: next.label };
}

export type DocStatus = { limit: number | null; count: number; full: boolean };
/** How many documents this person may hold. null: no limit (admins, and everyone before the start day). */
export function docStatus(l: Limits, who: Who, count: number, today: string): DocStatus {
  const c = Math.max(0, Math.floor(count || 0));
  if (who.admin || !limitOn(l, "documents", today)) return { limit: null, count: c, full: false };
  const limit = who.pro ? l.pro_documents : l.free_documents;
  return { limit, count: c, full: c >= limit };
}

export type CountStatus = { limit: number | null; count: number; full: boolean };
function countStatus(on: boolean, who: Who, count: number, freeLimit: number, proLimit: number | null): CountStatus {
  const c = Math.max(0, Math.floor(count || 0));
  if (who.admin || !on) return { limit: null, count: c, full: false };
  const limit = who.pro ? proLimit : freeLimit;
  return limit == null ? { limit: null, count: c, full: false } : { limit, count: c, full: c >= limit };
}
/** Loyalty cards this person has shared. Pro has no limit. */
export const sharingStatus = (l: Limits, who: Who, shared: number, today: string): CountStatus => countStatus(limitOn(l, "card_sharing", today), who, shared, l.free_shared_cards, null);
/** Papers on one trip. */
export const papersStatus = (l: Limits, who: Who, papers: number, today: string): CountStatus => countStatus(limitOn(l, "trip_papers", today), who, papers, l.free_trip_papers, l.pro_trip_papers);

/** Active business projects. Finished ones do not count. */
export const projectsStatus = (l: Limits, who: Who, active: number, today: string): CountStatus => countStatus(limitOn(l, "projects", today), who, active, l.free_projects, l.pro_projects);

/** The "What you get" table on the Get Pro page: one row for each limit that has a start day. */
export function proComparison(l: Limits): { label: string; free: string; pro: string }[] {
  const has = (k: LimitKey) => !!l.starts[k];
  const rows: { label: string; free: string; pro: string }[] = [];
  if (has("ai_scans")) rows.push({ label: "AI receipt scans", free: `${l.free_ai_scans} a month`, pro: "No limit" });
  if (has("bills_email")) rows.push({ label: "Bills by email", free: "No", pro: "Yes" });
  if (has("telegram_save")) rows.push({ label: "Telegram: save by chat", free: "No", pro: "Yes" });
  if (has("telegram_summary")) rows.push({ label: "Telegram: summaries", free: "No", pro: "Yes" });
  if (has("documents")) rows.push({ label: "Documents", free: String(l.free_documents), pro: String(l.pro_documents) });
  if (has("doc_reminders")) rows.push({ label: "Expiry reminders", free: "No", pro: "Yes" });
  if (has("card_sharing")) rows.push({ label: "Shared loyalty cards", free: String(l.free_shared_cards), pro: "No limit" });
  if (has("trip_papers")) rows.push({ label: "Papers per trip", free: String(l.free_trip_papers), pro: String(l.pro_trip_papers) });
  if (has("projects")) rows.push({ label: "Active business projects", free: String(l.free_projects), pro: String(l.pro_projects) });
  if (has("trip_reports")) rows.push({ label: "Trip and project reports (Excel, PDF)", free: "Receipt photos only", pro: "Yes" });
  rows.push({ label: "Share a reminder with someone", free: "No", pro: "Yes" });
  rows.push({ label: "Photos on a reminder", free: "3", pro: "10" });
  rows.push({ label: "Excel and PDF reports", free: "No", pro: "Yes" });
  return rows;
}
