/** The free Pro month for new accounts. The admin chooses when it is open; the database gives it when an account is created. */

export type TrialMode = "off" | "always" | "dates";
export type TrialSettings = { mode: TrialMode; days: number; from_date: string | null; to_date: string | null };

export const DEFAULT_TRIAL: TrialSettings = { mode: "always", days: 30, from_date: null, to_date: null };
export const TRIAL_COLS = "mode, days, from_date, to_date";

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function readTrial(row: Partial<Record<keyof TrialSettings, unknown>> | null | undefined): TrialSettings {
  const r = row ?? {};
  const mode: TrialMode = r.mode === "off" || r.mode === "dates" || r.mode === "always" ? r.mode : DEFAULT_TRIAL.mode;
  const days = Number.isInteger(Number(r.days)) && Number(r.days) >= 1 && Number(r.days) <= 365 ? Number(r.days) : DEFAULT_TRIAL.days;
  return { mode, days, from_date: isIso(r.from_date) ? r.from_date : null, to_date: isIso(r.to_date) ? r.to_date : null };
}

export function parseTrial(body: Record<string, unknown>): { ok: true; value: TrialSettings } | { ok: false; error: string } {
  const mode = body.mode;
  if (mode !== "off" && mode !== "always" && mode !== "dates") return { ok: false, error: "Choose Off, Always or Only between two dates." };
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: "The free month must be a whole number of days from 1 to 365." };
  if (mode !== "dates") return { ok: true, value: { mode, days, from_date: null, to_date: null } };
  const from = typeof body.from_date === "string" ? body.from_date.trim() : "";
  const to = typeof body.to_date === "string" ? body.to_date.trim() : "";
  if (from && !isIso(from)) return { ok: false, error: "The first day is not a valid date." };
  if (to && !isIso(to)) return { ok: false, error: "The last day is not a valid date." };
  if (!from && !to) return { ok: false, error: "Choose the first day, the last day, or both." };
  if (from && to && to < from) return { ok: false, error: "The last day is before the first day." };
  return { ok: true, value: { mode, days, from_date: from || null, to_date: to || null } };
}

/** Whether an account created on this day gets the free month. */
export function trialOpenOn(s: TrialSettings, day: string): boolean {
  if (s.mode === "off") return false;
  if (s.mode === "always") return true;
  return (!s.from_date || day >= s.from_date) && (!s.to_date || day <= s.to_date);
}

/** One sentence for the admin: what a new account gets today. */
export function trialSummary(s: TrialSettings, today: string): string {
  if (s.mode === "off") return "Off. New accounts start on Free.";
  if (s.mode === "always") return `On. Every new account gets ${s.days} days of Pro.`;
  const range = s.from_date && s.to_date ? `${s.from_date} to ${s.to_date}` : s.from_date ? `from ${s.from_date}` : `until ${s.to_date}`;
  return trialOpenOn(s, today) ? `Open now (${range}). New accounts get ${s.days} days of Pro.` : `Closed today. Open ${range}.`;
}
