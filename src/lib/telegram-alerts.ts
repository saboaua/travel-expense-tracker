/**
 * Messages to admins when something happens on the system. Pure decision functions (testable) plus
 * senders that never throw: an alert problem must not break the request that triggered it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml, sendToAdmins } from "@/lib/telegram-notify";

export type SecurityEventLike = { eventType: string; severity?: "info" | "warning" | "critical" | null; emailAttempted?: string | null; details?: Record<string, unknown> | null };
export type Alert = { text: string; urgent: boolean; dedupeKey: string };

const LABELS: Record<string, string> = {
  protection_degraded: "Protection is running in a reduced mode",
  login_blocked: "A sign-in was blocked after repeated failures",
  access_denied: "Access denied",
  rate_limit: "Rate limit reached",
  suspicious_input: "Suspicious input detected",
  csp_violation: "Browser security policy violation",
};

/** Event types an admin always hears about. Everything else only when the event itself is critical. */
const ALWAYS = new Set(["protection_degraded", "login_blocked"]);

/** A once-per-hour key (UTC hour, only used to space alerts apart, not as a calendar date). */
const hourKey = (d: Date = new Date()) => d.toISOString().slice(0, 13);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Returns the alert for a security event, or null when it is routine. At most one per event type per hour (floods stay quiet). */
export function alertForSecurityEvent(e: SecurityEventLike, now: Date = new Date()): Alert | null {
  const critical = e.severity === "critical";
  if (!critical && !ALWAYS.has(e.eventType)) return null;
  const label = LABELS[e.eventType] || e.eventType.replace(/_/g, " ");
  const who = e.emailAttempted ? `\nAccount: ${escapeHtml(cut(e.emailAttempted, 80))}` : "";
  return {
    text: `${critical ? "🚨" : "⚠️"} <b>${escapeHtml(label)}</b>${who}\nSee Admin → Security for details.`,
    urgent: critical,
    dedupeKey: `sec:${e.eventType}:${hourKey(now)}`,
  };
}

export type AuditLike = { actorId?: string | null; actorEmail?: string | null; action: string; details?: Record<string, unknown> | null };

/** Account and role changes are worth a line to the other admins. */
export function alertForAudit(a: AuditLike, now: Date = new Date()): Alert | null {
  const d = a.details || {};
  const by = escapeHtml(cut(String(a.actorEmail || "someone"), 80));
  const email = escapeHtml(cut(String(d.email || "a user"), 80));
  let text: string | null = null;
  if (a.action === "user.created") text = `👤 ${by} created the account ${email} (role: ${escapeHtml(String(d.role || "user"))}).`;
  else if (a.action === "user.role_changed") text = `🔑 ${by} changed the role of ${email}: ${escapeHtml(String(d.from ?? "?"))} → ${escapeHtml(String(d.to ?? "?"))}.`;
  else if (a.action === "role.deleted") text = `🗑 ${by} deleted a role.`;
  if (!text) return null;
  return { text, urgent: false, dedupeKey: `audit:${a.action}:${now.getTime()}:${String(d.email || "")}` };
}

export function supportAlert(name: string, subject: string | null, id: string): Alert {
  return {
    text: `📩 <b>New support request</b>\nFrom: ${escapeHtml(cut(name, 60))}${subject ? `\nSubject: ${escapeHtml(cut(subject, 100))}` : ""}\nOpen Admin → Support to answer.`,
    urgent: false,
    dedupeKey: `support:${id}`,
  };
}

async function deliver(supabase: SupabaseClient, alert: Alert | null, excludeUserId?: string | null) {
  if (!alert) return 0;
  try {
    return await sendToAdmins(supabase, alert.text, { dedupeKey: alert.dedupeKey, urgent: alert.urgent, excludeUserId });
  } catch (e) {
    console.error("[alerts] failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

export const notifySecurityEvent = (supabase: SupabaseClient, e: SecurityEventLike) => deliver(supabase, alertForSecurityEvent(e));
export const alertAdminsOfAudit = (supabase: SupabaseClient, a: AuditLike) => deliver(supabase, alertForAudit(a), a.actorId);
export const notifySupportRequest = (supabase: SupabaseClient, name: string, subject: string | null, id: string) => deliver(supabase, supportAlert(name, subject, id));
export const notifyJobFailure = (supabase: SupabaseClient, job: string) =>
  deliver(supabase, { text: `🚨 <b>Scheduled job failed</b>: ${escapeHtml(job)}\nCheck the Vercel logs.`, urgent: true, dedupeKey: `job:${job}:${hourKey()}` });
