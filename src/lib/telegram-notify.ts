/**
 * Messages the app sends on its own (trip reminders, admin alerts). The rules are pure and tested;
 * `sendToUser` / `sendToAdmins` add the database and Telegram calls around them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/telegram";

export type NotifyKind = "trip_reminder" | "document_reminder" | "admin_alert" | "system";

export type NotifyPrefs = {
  /** Master switch */
  enabled: boolean;
  trip_reminders: boolean;
  admin_alerts: boolean;
  /** Local hour when quiet time starts (22 = 10 pm) */
  quiet_start: number;
  /** Local hour when quiet time ends (7 = 7 am) */
  quiet_end: number;
  tz: string;
  /** Where the last upload went, e.g. "grocery" or "trip:<id>" */
  last_choice: string | null;
};

export const DEFAULT_PREFS: NotifyPrefs = { enabled: true, trip_reminders: true, admin_alerts: true, quiet_start: 22, quiet_end: 7, tz: "America/Aruba", last_choice: null };

/** The hour (0-23) it is in the given time zone. */
export function localHour(now: Date, tz: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now);
    const n = Number(h);
    return Number.isFinite(n) ? n % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

/** Quiet time may wrap midnight (22 to 7). Start equal to end means no quiet time. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export type SendDecision = { send: boolean; reason: "ok" | "off" | "kind_off" | "quiet" };

/** `urgent` messages (an admin alert about a break-in, say) ignore quiet hours but never the switches. */
export function shouldSend(prefs: NotifyPrefs, kind: NotifyKind, now: Date, urgent = false): SendDecision {
  if (!prefs.enabled) return { send: false, reason: "off" };
  if ((kind === "trip_reminder" || kind === "document_reminder") && !prefs.trip_reminders) return { send: false, reason: "kind_off" };
  if (kind === "admin_alert" && !prefs.admin_alerts) return { send: false, reason: "kind_off" };
  if (!urgent && inQuietHours(localHour(now, prefs.tz), prefs.quiet_start, prefs.quiet_end)) return { send: false, reason: "quiet" };
  return { send: true, reason: "ok" };
}

/** Merge what the database returned over the defaults; bad values fall back. */
export function normalizePrefs(row: Partial<NotifyPrefs> | null | undefined): NotifyPrefs {
  const hour = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : d);
  return {
    enabled: row?.enabled ?? DEFAULT_PREFS.enabled,
    trip_reminders: row?.trip_reminders ?? DEFAULT_PREFS.trip_reminders,
    admin_alerts: row?.admin_alerts ?? DEFAULT_PREFS.admin_alerts,
    quiet_start: hour(row?.quiet_start, DEFAULT_PREFS.quiet_start),
    quiet_end: hour(row?.quiet_end, DEFAULT_PREFS.quiet_end),
    tz: typeof row?.tz === "string" && row.tz ? row.tz : DEFAULT_PREFS.tz,
    last_choice: row?.last_choice ?? null,
  };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------------- database side ---------------- */

const PREF_COLS = "enabled, trip_reminders, admin_alerts, quiet_start, quiet_end, tz, last_choice";

export async function loadPrefs(supabase: SupabaseClient, userId: string): Promise<NotifyPrefs> {
  const { data, error } = await supabase.from("telegram_notify_prefs").select(PREF_COLS).eq("user_id", userId).maybeSingle();
  // Table missing (migration not run) or no row yet: defaults
  return error ? DEFAULT_PREFS : normalizePrefs(data as Partial<NotifyPrefs> | null);
}

export async function savePrefs(supabase: SupabaseClient, userId: string, patch: Partial<NotifyPrefs>): Promise<boolean> {
  const current = await loadPrefs(supabase, userId);
  const { error } = await supabase.from("telegram_notify_prefs").upsert({ user_id: userId, ...current, ...patch, updated_at: new Date().toISOString() });
  if (error) console.error("[telegram] save prefs", error.message);
  return !error;
}

export type SendResult = "sent" | "not_linked" | "off" | "kind_off" | "quiet" | "duplicate" | "failed";

/**
 * Sends one message to one person if they linked Telegram and allow it. `dedupeKey` makes it once-only per
 * person and kind (for example "trip:<id>:7d"): the log row is written first, so two runs at once cannot both send.
 */
export async function sendToUser(
  supabase: SupabaseClient,
  userId: string,
  kind: NotifyKind,
  text: string,
  opts: { dedupeKey?: string; urgent?: boolean; replyMarkup?: unknown; now?: Date } = {}
): Promise<SendResult> {
  const { data: profile } = await supabase.from("profiles").select("telegram_id").eq("id", userId).maybeSingle();
  if (!profile?.telegram_id) return "not_linked";

  const decision = shouldSend(await loadPrefs(supabase, userId), kind, opts.now ?? new Date(), opts.urgent);
  if (!decision.send) return decision.reason === "ok" ? "failed" : decision.reason;

  let logId: number | null = null;
  if (opts.dedupeKey) {
    const { data, error } = await supabase.from("telegram_sent_log").insert({ user_id: userId, kind, dedupe_key: opts.dedupeKey }).select("id").single();
    if (error) return error.code === "23505" ? "duplicate" : "failed";
    logId = data.id as number;
  }
  try {
    await sendMessage(Number(profile.telegram_id), text, opts.replyMarkup ? { reply_markup: opts.replyMarkup } : undefined);
    return "sent";
  } catch (e) {
    console.error("[telegram] send failed", e instanceof Error ? e.message : e);
    // Not delivered: free the key so a later run can try again
    if (logId != null) await supabase.from("telegram_sent_log").delete().eq("id", logId);
    return "failed";
  }
}

/** Sends to every linked admin who allows admin alerts. */
export async function sendToAdmins(supabase: SupabaseClient, text: string, opts: { dedupeKey?: string; urgent?: boolean; replyMarkup?: unknown; excludeUserId?: string | null } = {}): Promise<number> {
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").not("telegram_id", "is", null);
  let sent = 0;
  for (const a of admins || []) {
    if (opts.excludeUserId && a.id === opts.excludeUserId) continue;
    if ((await sendToUser(supabase, a.id as string, "admin_alert", text, opts)) === "sent") sent++;
  }
  return sent;
}
