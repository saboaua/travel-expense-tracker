/**
 * Dashboard notifications (the bell). Pure functions so the rules can be tested.
 * Each notification has an id that includes the state it describes (e.g. the passport expiry and
 * level), so when the situation changes it is a new notification and shows up again.
 */
import { dayDiff, type RenewalAlert } from "@/lib/documents";
import { unreviewedFeatures } from "@/lib/access";

export type Severity = "urgent" | "warning" | "info";

export type AppNotification = {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  href: string;
  cta: string;
  /** Defaults to true, except for urgent items which stay until the cause is fixed */
  dismissible?: boolean;
};

type TripLite = { id: string; name: string; start_date: string; end_date: string | null; status: string };

const RANK: Record<Severity, number> = { urgent: 0, warning: 1, info: 2 };
const DOCS_REMINDER_DAYS = 14;
export const SNOOZE_DAYS = 7;

export function buildNotifications(input: {
  passportAlert: RenewalAlert | null;
  trips: TripLite[];
  /** number of documents stored per trip id */
  docCounts: Record<string, number>;
  today: string;
}): AppNotification[] {
  const { passportAlert, trips, docCounts, today } = input;
  const out: AppNotification[] = [];

  if (passportAlert) {
    out.push({
      id: `passport:${passportAlert.expiry}:${passportAlert.level}`,
      severity: passportAlert.level === "renew" ? "warning" : "urgent",
      title: passportAlert.title,
      message: passportAlert.tripConflict && passportAlert.level === "renew"
        ? `${passportAlert.tripConflict.tripName} needs a passport valid until ${passportAlert.tripConflict.mustBeValidUntil}. Yours expires ${passportAlert.expiry}.`
        : `Expires ${passportAlert.expiry}. ${passportAlert.message}`,
      href: "/documents",
      cta: "Open documents",
    });
  }

  const active = trips.filter((t) => t.status === "active");

  // Upcoming trips with nothing uploaded yet
  for (const t of active) {
    const days = dayDiff(today, t.start_date);
    if (days >= 0 && days <= DOCS_REMINDER_DAYS && !(docCounts[t.id] > 0)) {
      out.push({
        id: `nodocs:${t.id}`,
        severity: "info",
        title: `Add documents for ${t.name}`,
        message: `${days === 0 ? "Starts today" : `Starts in ${days} day${days !== 1 ? "s" : ""}`}. Keep your ticket, booking and visa in one place.`,
        href: `/trips/${t.id}`,
        cta: "Add documents",
      });
    }
  }

  // Trips whose dates have passed but were never marked complete
  const ended = active.filter((t) => (t.end_date || t.start_date) < today);
  if (ended.length === 1) {
    out.push({
      id: `ended:${ended[0].id}`,
      severity: "info",
      title: `${ended[0].name} has ended`,
      message: "It stays active so you can keep adding receipts. Mark it complete when you are done.",
      href: `/trips/${ended[0].id}`,
      cta: "Open trip",
    });
  } else if (ended.length > 1) {
    out.push({
      id: `ended:${ended.map((t) => t.id).sort().join(",")}`,
      severity: "info",
      title: `${ended.length} trips have ended`,
      message: "They are still active. Mark them complete when all receipts are in.",
      href: "/trips",
      cta: "Review trips",
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export const isDismissible = (n: AppNotification) => n.dismissible ?? n.severity !== "urgent";

/** Drops notifications the user dismissed in the last SNOOZE_DAYS (except ones that can't be dismissed). */
export function visibleNotifications(list: AppNotification[], dismissed: Record<string, number>, now: number): AppNotification[] {
  return list.filter((n) => {
    if (!isDismissible(n)) return true;
    const at = dismissed[n.id];
    return !(at && now - at < SNOOZE_DAYS * 86_400_000);
  });
}

export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function topSeverity(list: AppNotification[]): Severity | null {
  if (list.length === 0) return null;
  return list.reduce<Severity>((best, n) => (RANK[n.severity] < RANK[best] ? n.severity : best), "info");
}

/* ---------------- security alerts (admins only) ---------------- */

type SecurityEventLite = { event_type: string; severity: string; created_at: string };

const SECURITY_WINDOW_HOURS = 24;
/** One mistyped password is normal; this many in a day is worth an admin's attention. */
const FAILED_LOGIN_THRESHOLD = 5;
const SECURITY_LABELS: Record<string, string> = {
  brute_force: "Brute force attack detected",
  login_blocked: "Logins blocked by lockout",
  suspicious_input: "Suspicious input detected",
  access_denied: "Access denied attempts",
  rate_limit: "Rate limit hit",
  support_spam: "Support form spam",
  temp_password_expired: "Expired temporary password used",
  login_failed: "Failed logins",
  protection_degraded: "Sign-in protection degraded",
};

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
};

/**
 * Turns recent warning/critical security events into bell notifications, one per event type.
 * Only the counts are shown here (no emails or IPs); details live on the Security page.
 * The id carries the latest event time, so a new event brings back a dismissed alert.
 * Call this for admins only.
 */
export function buildSecurityNotifications(events: SecurityEventLite[], now: number, max = 3): AppNotification[] {
  const since = now - SECURITY_WINDOW_HOURS * 3_600_000;
  const groups = new Map<string, { count: number; latest: string; critical: boolean }>();
  for (const e of events) {
    if (e.severity !== "warning" && e.severity !== "critical") continue;
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t) || t < since) continue;
    const g = groups.get(e.event_type) || { count: 0, latest: e.created_at, critical: false };
    g.count++;
    if (e.created_at > g.latest) g.latest = e.created_at;
    if (e.severity === "critical" || e.event_type === "brute_force") g.critical = true;
    groups.set(e.event_type, g);
  }

  return [...groups.entries()]
    .filter(([type, g]) => type !== "login_failed" || g.count >= FAILED_LOGIN_THRESHOLD)
    .map(([type, g]): AppNotification & { _count: number } => ({
      id: `security:${type}:${g.latest}`,
      severity: g.critical ? "urgent" : "warning",
      title: `${g.critical ? "Security alert: " : ""}${SECURITY_LABELS[type] || type.replace(/_/g, " ")}`,
      message: `${g.count} event${g.count !== 1 ? "s" : ""} in the last ${SECURITY_WINDOW_HOURS} hours. Latest ${ago(now - Date.parse(g.latest))}.`,
      href: "/admin/security",
      cta: "Review in Security",
      dismissible: true,
      _count: g.count,
    }))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b._count - a._count)
    .slice(0, max)
    .map(({ _count, ...n }) => { void _count; return n; });
}

/* ---------------- new app options to assign (admins only) ---------------- */

/** One notice when options exist that no one has reviewed for a role yet. The id changes when the set changes. */
export function buildAccessNotification(roles: { key: string; label?: string; known_features?: string[] | null }[]): AppNotification[] {
  const labels = new Map<string, string>();
  const roleNames = new Set<string>();
  for (const r of roles) {
    for (const f of unreviewedFeatures({ key: r.key, known_features: r.known_features || [] })) {
      labels.set(f.key, f.label);
      roleNames.add(r.label || r.key);
    }
  }
  if (labels.size === 0) return [];
  const list = [...labels.values()];
  return [
    {
      id: `roles-new:${[...labels.keys()].sort().join(",")}`,
      severity: "info",
      title: `${list.length} new option${list.length !== 1 ? "s" : ""} to assign`,
      message: `${list.slice(0, 3).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}. Choose which roles can use ${list.length !== 1 ? "them" : "it"}.`,
      href: "/admin/users?tab=roles",
      cta: "Review roles",
    },
  ];
}
