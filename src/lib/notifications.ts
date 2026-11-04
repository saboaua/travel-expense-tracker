/**
 * Dashboard notifications (the bell). Pure functions so the rules can be tested.
 * Each notification has an id that includes the state it describes (e.g. the passport expiry and
 * level), so when the situation changes it is a new notification and shows up again.
 */
import { dayDiff, type RenewalAlert } from "@/lib/documents";

export type Severity = "urgent" | "warning" | "info";

export type AppNotification = {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  href: string;
  cta: string;
};

type TripLite = { id: string; name: string; start_date: string; end_date: string | null; status: string };

const RANK: Record<Severity, number> = { urgent: 0, warning: 1, info: 2 };
export const DOCS_REMINDER_DAYS = 14;
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

/** Drops notifications the user dismissed in the last SNOOZE_DAYS. Urgent ones can't be dismissed. */
export function visibleNotifications(list: AppNotification[], dismissed: Record<string, number>, now: number): AppNotification[] {
  return list.filter((n) => {
    if (n.severity === "urgent") return true;
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
