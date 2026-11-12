/**
 * The two summaries the daily job sends:
 *  - every person with Telegram linked gets a weekly summary of their own trips, spending and documents;
 *  - every admin also gets a daily health summary of the app.
 * Texts come from pure functions (tested without a database); the gather functions read with the service role
 * and always filter by the person's own id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, daysBetween, formatCurrency, formatDateRange } from "@/lib/utils";
import { kindLabel } from "@/lib/documents";
import { escapeHtml, sendToUser } from "@/lib/telegram-notify";
import { documentTier } from "@/lib/telegram-reminders";

/** Reads every row of a query, 1000 at a time (the server never returns more than that in one go). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>): Promise<{ rows: T[]; failed: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { rows, failed: true };
    rows.push(...(data || []));
    if (!data || data.length < 1000) return { rows, failed: false };
  }
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const monthName = (monthStart: string) => new Date(`${monthStart}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/* ---------------- weekly summary for one person ---------------- */

export type SummaryTrip = { name: string; destination: string | null; start_date: string; end_date: string | null; personal: boolean };
export type SummaryDoc = { title: string; kind: string; days: number };
export type MonthSpend = { label: string; business: number; personal: number };

export type UserSummary = {
  today: string;
  inProgress: SummaryTrip[];
  upcoming: SummaryTrip[];
  thisMonth: MonthSpend;
  lastMonth: MonthSpend;
  groceries: { currency: string; total: number }[];
  documents: SummaryDoc[];
};

/** How far ahead the summary looks for trips. */
export const SUMMARY_TRIP_DAYS = 30;

const moneyLine = (m: MonthSpend) => `${m.label}: ${formatCurrency(m.business)} business · ${formatCurrency(m.personal)} personal`;
const tripLine = (t: SummaryTrip, today: string, withWhen: boolean) => {
  const when = withWhen ? (() => { const d = daysBetween(today, t.start_date); return d <= 1 ? (d === 1 ? " · tomorrow" : " · today") : ` · in ${d} days`; })() : "";
  return `${t.personal ? "🌴" : "✈️"} ${escapeHtml(t.name)}${t.personal ? " (personal)" : ""} · ${formatDateRange(t.start_date, t.end_date)}${t.destination ? ` · ${escapeHtml(t.destination)}` : ""}${when}`;
};

/** True when there is nothing worth a message. */
export function summaryIsEmpty(s: UserSummary): boolean {
  return !s.inProgress.length && !s.upcoming.length && !s.documents.length && !s.groceries.length && !s.thisMonth.business && !s.thisMonth.personal && !s.lastMonth.business && !s.lastMonth.personal;
}

export function userSummaryText(s: UserSummary): string {
  const lines = [`📅 <b>Your weekly summary</b> · ${formatDateRange(s.today, null)}`, ""];
  lines.push("<b>Trips</b>");
  if (s.inProgress.length) {
    lines.push("Happening now:");
    for (const t of s.inProgress.slice(0, 5)) lines.push(tripLine(t, s.today, false));
  }
  if (s.upcoming.length) {
    lines.push(`Next ${SUMMARY_TRIP_DAYS} days:`);
    for (const t of s.upcoming.slice(0, 6)) lines.push(tripLine(t, s.today, true));
    if (s.upcoming.length > 6) lines.push(`and ${s.upcoming.length - 6} more`);
  }
  if (!s.inProgress.length && !s.upcoming.length) lines.push(`No trips planned in the next ${SUMMARY_TRIP_DAYS} days.`);

  lines.push("", "<b>Spending</b>", moneyLine(s.thisMonth) + " (so far)", moneyLine(s.lastMonth));
  if (s.groceries.length) lines.push(`Groceries in ${s.thisMonth.label}: ${s.groceries.map((g) => formatCurrency(g.total, g.currency)).join(" + ")}`);

  if (s.documents.length) {
    lines.push("", "<b>Documents to renew</b>");
    for (const d of s.documents.slice(0, 4)) lines.push(`🛂 ${escapeHtml(d.title)} · ${d.days < 0 ? `expired ${-d.days}d ago` : d.days === 0 ? "expires today" : `${d.days}d left`} (${kindLabel(d.kind).toLowerCase()})`);
    if (s.documents.length > 4) lines.push(`and ${s.documents.length - 4} more`);
  }
  return lines.join("\n");
}

export async function gatherUserSummary(supabase: SupabaseClient, today: string, userId: string): Promise<UserSummary> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = `${addDaysISO(monthStart, -1).slice(0, 7)}-01`;
  const horizon = addDaysISO(today, SUMMARY_TRIP_DAYS);

  const [biz, personal, docs] = await Promise.all([
    supabase.from("trips").select("name, destination, start_date, end_date").eq("user_id", userId).eq("status", "active").lte("start_date", horizon),
    // personal_projects only exists once the personal section is set up; an error just means no personal trips
    supabase.from("personal_projects").select("name, destination, start_date, end_date").eq("user_id", userId).eq("kind", "personal_trip").eq("status", "active").lte("start_date", horizon),
    supabase.from("travel_documents").select("title, kind, expiry_date").eq("user_id", userId).is("trip_id", null).not("expiry_date", "is", null).lte("expiry_date", addDaysISO(today, 270)),
  ]);
  const trips: SummaryTrip[] = [
    ...((biz.data || []) as Omit<SummaryTrip, "personal">[]).map((t) => ({ ...t, personal: false })),
    ...((personal.error ? [] : personal.data || []) as Omit<SummaryTrip, "personal">[]).map((t) => ({ ...t, personal: true })),
  ].filter((t) => (t.end_date || t.start_date) >= today);
  const byStart = (a: SummaryTrip, b: SummaryTrip) => a.start_date.localeCompare(b.start_date);
  const inProgress = trips.filter((t) => t.start_date <= today).sort(byStart);
  const upcoming = trips.filter((t) => t.start_date > today).sort(byStart);

  const spend = async (table: string) => {
    const { rows, failed } = await fetchAll<{ amount_usd: number | null; expense_date: string }>((f, t) =>
      supabase.from(table).select("amount_usd, expense_date").eq("user_id", userId).gte("expense_date", lastMonthStart).lte("expense_date", today).order("id").range(f, t));
    const mine = { this: 0, last: 0 };
    for (const r of failed ? [] : rows) {
      if (r.expense_date >= monthStart) mine.this += num(r.amount_usd);
      else mine.last += num(r.amount_usd);
    }
    return mine;
  };
  const [bizSpend, perSpend, groc] = await Promise.all([
    spend("expenses"),
    spend("personal_expenses"),
    // Receipts kept only for their prices are not spending. Before the price-notes migration there is no such column.
    (async () => {
      const q = (cols: string) => fetchAll<{ total: number; currency: string; prices_only?: boolean | null }>((f, t) => supabase.from("grocery_receipts").select(cols).eq("user_id", userId).gte("purchase_date", monthStart).lte("purchase_date", today).order("id").range(f, t) as never);
      let res = await q("total, currency, prices_only");
      if (res.failed) res = await q("total, currency");
      return { ...res, rows: res.rows.filter((r) => r.prices_only !== true) };
    })(),
  ]);
  const byCurrency = new Map<string, number>();
  for (const g of groc.failed ? [] : groc.rows) byCurrency.set(g.currency, (byCurrency.get(g.currency) || 0) + num(g.total));

  const documents: SummaryDoc[] = [];
  for (const d of (docs.error ? [] : docs.data || []) as { title: string; kind: string; expiry_date: string }[]) {
    const step = documentTier(d, today);
    if (step && step.tier !== "soon") documents.push({ title: d.title, kind: d.kind, days: step.days });
  }
  documents.sort((a, b) => a.days - b.days);

  return {
    today,
    inProgress,
    upcoming,
    thisMonth: { label: monthName(monthStart), business: round2(bizSpend.this), personal: round2(perSpend.this) },
    lastMonth: { label: monthName(lastMonthStart), business: round2(bizSpend.last), personal: round2(perSpend.last) },
    groceries: [...byCurrency.entries()].map(([currency, total]) => ({ currency, total: round2(total) })),
    documents,
  };
}

/** The weekly summary goes out on Monday; Tuesday is a second chance for anyone held back by quiet hours or a failed send. */
export function summaryWeek(today: string): string | null {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (dow !== 1 && dow !== 2) return null;
  return addDaysISO(today, dow === 1 ? 0 : -1); // the Monday of that week, used as the once-a-week key
}

export async function runUserSummaries(supabase: SupabaseClient, today: string, now: Date = new Date()) {
  const out = { checked: 0, sent: 0, skipped: 0 };
  const week = summaryWeek(today);
  if (!week) return out;
  const { data: people } = await supabase.from("profiles").select("id").not("telegram_id", "is", null);
  for (const p of people || []) {
    out.checked++;
    const summary = await gatherUserSummary(supabase, today, p.id as string);
    if (summaryIsEmpty(summary)) { out.skipped++; continue; }
    const r = await sendToUser(supabase, p.id as string, "summary", userSummaryText(summary), { dedupeKey: `summary:${week}`, now });
    if (r === "sent") out.sent++;
    else out.skipped++;
  }
  return out;
}

/* ---------------- daily health summary for admins ---------------- */

export type HealthStats = {
  today: string;
  database: { ok: boolean; ms: number };
  /** Settings the app needs for each feature; false means the feature is switched off or will fail */
  config: { name: string; ok: boolean }[];
  bot: { configured: boolean; enabled: boolean };
  security: { critical: number; warning: number; total: number } | null;
  newPeople: number | null;
  totalPeople: number | null;
  openSupport: number | null;
  sharingOff: boolean | null;
  messagesSent: number | null;
};

export function healthIssues(h: HealthStats): string[] {
  const issues: string[] = [];
  if (!h.database.ok) issues.push("Database did not answer");
  if (!h.bot.configured) issues.push("Telegram bot token is missing");
  else if (!h.bot.enabled) issues.push("Telegram bot is switched off in settings");
  for (const c of h.config) if (!c.ok) issues.push(`${c.name} is not set`);
  if (h.security?.critical) issues.push(`${h.security.critical} critical security ${h.security.critical === 1 ? "event" : "events"}`);
  if (h.sharingOff) issues.push("Sharing is switched off for everyone (failsafe or admin)");
  return issues;
}

export function healthText(h: HealthStats): string {
  const issues = healthIssues(h);
  const lines = [`🩺 <b>App health</b> · ${formatDateRange(h.today, null)}`, "", issues.length ? `⚠️ <b>${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} attention</b>` : "✅ <b>Everything looks good</b>"];
  for (const i of issues) lines.push(`• ${escapeHtml(i)}`);
  lines.push("", "<b>Status</b>");
  lines.push(`Database: ${h.database.ok ? `ok (${h.database.ms} ms)` : "down"}`);
  lines.push(`Telegram bot: ${!h.bot.configured ? "no token" : h.bot.enabled ? "on" : "off"}`);
  if (h.sharingOff !== null) lines.push(`Sharing: ${h.sharingOff ? "off for everyone" : "on"}`);
  if (h.security) lines.push(`Security, last 24h: ${h.security.total} ${h.security.total === 1 ? "event" : "events"} (${h.security.critical} critical, ${h.security.warning} ${h.security.warning === 1 ? "warning" : "warnings"})`);
  lines.push("", "<b>Activity</b>");
  if (h.newPeople !== null) lines.push(`New sign-ups, last 24h: ${h.newPeople}${h.totalPeople !== null ? ` (${h.totalPeople} people in total)` : ""}`);
  lines.push(`Open support requests: ${h.openSupport ?? "unknown"}`);
  if (h.messagesSent !== null) lines.push(`Telegram messages sent, last 24h: ${h.messagesSent}`);
  return lines.join("\n");
}

type Env = Record<string, string | undefined>;

export async function gatherHealth(supabase: SupabaseClient, today: string, opts: { env?: Env; bot?: { configured: boolean; enabled: boolean }; now?: Date } = {}): Promise<HealthStats> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  const t0 = Date.now();
  const ping = await supabase.from("profiles").select("id", { count: "exact", head: true });
  const database = { ok: !ping.error, ms: Date.now() - t0 };

  const [events, people, support, settings, log] = await Promise.all([
    supabase.from("security_events").select("severity").gte("created_at", since).limit(1000),
    supabase.from("profiles").select("id, created_at"),
    supabase.from("support_requests").select("id").eq("status", "new"),
    supabase.from("app_settings").select("sharing_disabled").eq("id", 1).maybeSingle(),
    supabase.from("telegram_sent_log").select("id").gte("sent_at", since).limit(1000),
  ]);
  const sev = (events.data || []) as { severity: string }[];
  const everyone = (people.data || []) as { created_at: string }[];
  return {
    today,
    database,
    config: [
      { name: "CRON_SECRET", ok: !!env.CRON_SECRET },
      { name: "GEMINI_API_KEY (receipt scanning)", ok: !!env.GEMINI_API_KEY },
      { name: "RESEND_API_KEY (support email)", ok: !!env.RESEND_API_KEY },
      { name: "TURNSTILE_SECRET_KEY (sign-in check)", ok: !!env.TURNSTILE_SECRET_KEY },
    ],
    bot: opts.bot ?? { configured: !!env.TELEGRAM_BOT_TOKEN, enabled: true },
    security: events.error ? null : { critical: sev.filter((e) => e.severity === "critical").length, warning: sev.filter((e) => e.severity === "warning").length, total: sev.length },
    newPeople: people.error ? null : everyone.filter((p) => p.created_at >= since).length,
    totalPeople: people.error ? null : everyone.length,
    openSupport: support.error ? null : (support.data || []).length,
    sharingOff: settings.error || !settings.data ? null : !!(settings.data as { sharing_disabled?: boolean }).sharing_disabled,
    messagesSent: log.error ? null : (log.data || []).length,
  };
}

/** Every linked admin gets the health summary once a day (it also goes out if the database is down: that is when it matters). */
export async function runAdminHealth(supabase: SupabaseClient, today: string, opts: Parameters<typeof gatherHealth>[2] = {}) {
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").not("telegram_id", "is", null);
  if (!admins?.length) return 0;
  const text = healthText(await gatherHealth(supabase, today, opts));
  let sent = 0;
  for (const a of admins) {
    if ((await sendToUser(supabase, a.id as string, "admin_alert", text, { dedupeKey: `health:${today}`, now: opts.now })) === "sent") sent++;
  }
  return sent;
}
