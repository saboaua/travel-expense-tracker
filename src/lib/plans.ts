/** Paid features. For now an admin switches Pro on by hand, for a month, a year or as a gift; it ends by itself on its end date. */

export type PlanPeriod = "monthly" | "yearly" | "gift" | "trial";
/** What an admin can give by hand. The free month is only given by the system at sign-up. */
export type ManualPeriod = Exclude<PlanPeriod, "trial">;
export type PlanRow = { user_id: string; plan: "pro"; period: PlanPeriod; ends_on: string | null };

export const PLAN_COLS = "user_id, plan, period, ends_on";
export const PERIOD_LABEL: Record<PlanPeriod, string> = { monthly: "Pro, monthly", yearly: "Pro, yearly", gift: "Pro, gift", trial: "Pro, free month" };

/** Pro is on while the plan has no end date or the end date is today or later. */
export function isProActive(row: Pick<PlanRow, "plan" | "ends_on"> | null | undefined, today: string): boolean {
  if (!row || row.plan !== "pro") return false;
  return !row.ends_on || row.ends_on >= today;
}

/** The same day next month or next year, kept inside short months (Jan 31 gives Feb 28). */
export function defaultEndsOn(period: PlanPeriod, today: string): string | null {
  if (period === "gift") return null;
  const [y, m, d] = today.split("-").map(Number);
  const months = period === "yearly" ? 12 : 1;
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export const isPeriod = (v: unknown): v is ManualPeriod => v === "monthly" || v === "yearly" || v === "gift";
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** What the admin list says under a name: the plan and when it ends. */
export function planSummary(row: Pick<PlanRow, "period" | "ends_on"> | null | undefined, today: string): { title: string; sub: string; pro: boolean } {
  if (!row) return { title: "Free", sub: "No plan", pro: false };
  const active = isProActive({ plan: "pro", ends_on: row.ends_on }, today);
  if (!active) return { title: "Free", sub: "Pro ended " + row.ends_on, pro: false };
  return { title: PERIOD_LABEL[row.period] ?? "Pro", sub: row.ends_on ? `Until ${row.ends_on}` : "No end date", pro: true };
}

/** What the Profile plan card says: the title, the line under it, and whether Pro is on. Admins always have Pro. */
export function planCardText(opts: { isAdmin: boolean; row: Pick<PlanRow, "period" | "ends_on"> | null | undefined; today: string }): { title: string; sub: string; pro: boolean; admin: boolean } {
  if (opts.isAdmin) return { title: "Pro, admin access", sub: "Always on for admins", pro: true, admin: true };
  const s = planSummary(opts.row, opts.today);
  if (!s.pro) {
    const t = trialState(opts.row ? { period: opts.row.period, ends_on: opts.row.ends_on } : null, opts.today);
    return { title: "Free plan", sub: t.state === "ended" ? `Your free month ended ${t.endsOn}. Get Pro to keep reports.` : "Excel and PDF reports are a Pro feature", pro: false, admin: false };
  }
  const end = opts.row?.ends_on;
  if (!end) return { title: s.title.replace("Pro, ", "Pro, "), sub: "No end date", pro: true, admin: false };
  const days = Math.max(0, Math.round((Date.parse(end) - Date.parse(opts.today)) / 86400000));
  return { title: s.title, sub: `Until ${end} · ${days} day${days === 1 ? "" : "s"} left`, pro: true, admin: false };
}

/** Where a new account stands in its free Pro month. "none" for anyone who never had one or has since paid. */
export type TrialState = { state: "none" | "active" | "ending" | "ended"; daysLeft: number; endsOn: string | null };
export const TRIAL_ENDING_DAYS = 7;
export function trialState(row: Pick<PlanRow, "period" | "ends_on"> | null | undefined, today: string): TrialState {
  if (!row || row.period !== "trial" || !row.ends_on) return { state: "none", daysLeft: 0, endsOn: null };
  const daysLeft = Math.round((Date.parse(row.ends_on) - Date.parse(today)) / 86400000);
  if (daysLeft < 0) return { state: "ended", daysLeft: 0, endsOn: row.ends_on };
  return { state: daysLeft <= TRIAL_ENDING_DAYS ? "ending" : "active", daysLeft, endsOn: row.ends_on };
}
