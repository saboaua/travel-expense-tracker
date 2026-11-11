/**
 * Partner sharing, version 1: the pure rules (types, limits, wording, bell items). No I/O, so it is unit-tested.
 * The real enforcement lives in the database (supabase/migration_sharing.sql); this file only shapes what the screens show.
 */
import type { AppNotification } from "@/lib/notifications";

export const SHARING_LIMITS = { partners: 4, pending: 10, invitesPerDay: 5, inviteDays: 14 } as const;

export type ShareKind = "loyalty_card" | "trip" | "personal_trip";
export const SHARE_KINDS: ShareKind[] = ["loyalty_card", "trip", "personal_trip"];

export type IncomingInvite = { id: string; from_name: string; from_email: string | null; created_at: string };
export type Partner = {
  id: string;
  status: "pending" | "active";
  direction: "sent" | "received";
  /** First name, only once the pairing is active */
  name: string | null;
  email: string | null;
  since: string | null;
  created_at: string;
};
export type ShareRow = { id: string; partnership_id: string; kind: ShareKind; item_id: string };
export type SharingOverview =
  | { available: false }
  | { available: true; enabled: boolean; incoming: IncomingInvite[]; partners: Partner[]; accepted: { id: string; name: string; at: string }[]; shares: ShareRow[] };

export type SharedCard = {
  share_id: string;
  card_id: string;
  store_name: string;
  holder_name: string | null;
  category: string | null;
  card_number: string;
  barcode_format: string;
  color: string | null;
  has_image: boolean;
  shared_by: string;
};
import type { FlightFields } from "@/lib/flights";

export type SharedTrip = {
  share_id: string;
  kind: "trip" | "personal_trip";
  trip_id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  shared_by: string;
};

/** A flight on a shared trip: details only. Confirmation code, seat, cabin and alert settings are never part of it. */
export type SharedFlight = Pick<FlightFields, "flight_number" | "airline" | "aircraft" | "flight_date" | "dep_iata" | "dep_city" | "dep_name" | "dep_local" | "dep_est_local" | "dep_offset" | "dep_terminal" | "dep_gate" | "arr_iata" | "arr_city" | "arr_name" | "arr_local" | "arr_est_local" | "arr_offset" | "arr_terminal" | "arr_gate" | "status"> & {
  share_id: string;
  trip_id: string;
  flight_id: string;
  leg: "outbound" | "return" | "connection";
  source: "auto" | "manual";
  shared_by: string;
};
export const SHARED_FLIGHT_FIELDS = ["share_id", "trip_id", "flight_id", "leg", "flight_number", "airline", "aircraft", "flight_date", "dep_iata", "dep_city", "dep_name", "dep_local", "dep_est_local", "dep_offset", "dep_terminal", "dep_gate", "arr_iata", "arr_city", "arr_name", "arr_local", "arr_est_local", "arr_offset", "arr_terminal", "arr_gate", "status", "source", "shared_by"] as const;

/** The only fields a shared trip may have. The server drops everything else before sending (and the database never returns it). */
export const SHARED_TRIP_FIELDS = ["share_id", "kind", "trip_id", "name", "destination", "start_date", "end_date", "shared_by"] as const;
export const SHARED_CARD_FIELDS = ["share_id", "card_id", "store_name", "holder_name", "category", "card_number", "barcode_format", "color", "has_image", "shared_by"] as const;

const dayOnly = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function pick<T extends object>(row: Record<string, unknown>, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out as T;
}
/** Belt and braces: even if a function ever returned an extra column, it would not leave the server. */
export const cleanSharedTrips = (rows: unknown): SharedTrip[] =>
  (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === "object")
    .map((r) => pick<SharedTrip>(r as Record<string, unknown>, SHARED_TRIP_FIELDS))
    // dates are plain days (YYYY-MM-DD), whatever form the database driver used
    .map((t) => ({ ...t, start_date: dayOnly(t.start_date), end_date: dayOnly(t.end_date) }));
/** Same belt and braces for flights: only the listed fields leave the server, and times are plain local clock text. */
export const cleanSharedFlights = (rows: unknown): SharedFlight[] =>
  (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === "object")
    .map((r) => pick<SharedFlight>(r as Record<string, unknown>, SHARED_FLIGHT_FIELDS))
    .map((f) => {
      const local = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? `${v.slice(0, 10)}T${v.slice(11, 16)}` : null);
      return { ...f, flight_date: dayOnly(f.flight_date) ?? "", dep_local: local(f.dep_local), dep_est_local: local(f.dep_est_local), arr_local: local(f.arr_local), arr_est_local: local(f.arr_est_local) };
    });
export const cleanSharedCards = (rows: unknown): SharedCard[] =>
  (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object").map((r) => pick<SharedCard>(r as Record<string, unknown>, SHARED_CARD_FIELDS));

/* ---------------- input ---------------- */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
export function isValidEmail(v: string): boolean {
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/* ---------------- wording ---------------- */

const MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  sharing_off: "Sharing is not available right now.",
  enable_first: "Turn on sharing first.",
  bad_email: "Enter a valid email address.",
  self_invite: "That is your own email address.",
  partner_limit: `You can have up to ${SHARING_LIMITS.partners} partners.`,
  pending_limit: "You have too many invites waiting. Cancel one first.",
  daily_limit: `You can send up to ${SHARING_LIMITS.invitesPerDay} invites a day. Try again tomorrow.`,
  not_found: "That is no longer available.",
  bad_action: "Something went wrong. Please try again.",
  bad_kind: "Something went wrong. Please try again.",
};
const CODES = Object.keys(MESSAGES);

/** Turns a database error message into a known code, or null. Unknown errors are never shown to the person. */
export function sharingErrorCode(message: unknown): string | null {
  if (typeof message !== "string") return null;
  return CODES.find((c) => new RegExp(`(^|[^a-z_])${c}([^a-z_]|$)`).test(message)) ?? null;
}
export const sharingMessage = (code: string | null) => (code && MESSAGES[code]) || "Sharing hit a problem. Please try again.";
export function statusForCode(code: string | null): number {
  if (!code) return 500;
  if (code === "daily_limit" || code === "pending_limit" || code === "partner_limit") return 429;
  if (code === "not_signed_in") return 401;
  if (code === "sharing_off") return 403;
  if (code === "not_found") return 404;
  return 400;
}

export const INVITE_SENT_MESSAGE = "Invite sent. If this person uses Lifolio, they will see it on their bell. It stays open for 14 days.";
export const kindLabel = (k: ShareKind) => (k === "loyalty_card" ? "card" : "trip");

/* ---------------- the bell ---------------- */

/** Invites waiting for an answer (cannot be dismissed until answered) and "accepted" notices (can be dismissed). */
export function buildSharingNotifications(o: SharingOverview | null | undefined): AppNotification[] {
  if (!o || !o.available) return [];
  const out: AppNotification[] = [];
  for (const i of o.incoming) {
    out.push({
      id: `sharing-invite:${i.id}`,
      severity: "info",
      title: `${i.from_name} wants to share with you`,
      message: "Turn on sharing to accept. Nothing is shared until you accept.",
      href: "/profile#sharing",
      cta: "Review invite",
      dismissible: false,
    });
  }
  for (const a of o.accepted) {
    out.push({
      id: `sharing-accepted:${a.id}`,
      severity: "info",
      title: `${a.name} accepted your invite`,
      message: "You can now choose which cards and trips to share with them.",
      href: "/profile#sharing",
      cta: "Open Sharing",
      dismissible: true,
    });
  }
  return out;
}

/** The invite to show in a popup next, skipping ones already shown on this device. */
export function nextInvitePopup(o: SharingOverview | null | undefined, seen: string[]): IncomingInvite | null {
  if (!o || !o.available) return null;
  return o.incoming.find((i) => !seen.includes(i.id)) ?? null;
}

/* ---------------- sharing an item ---------------- */

/** Active partners, for the "Share with" row. */
export function activePartners(o: SharingOverview | null | undefined): Partner[] {
  return o && o.available ? o.partners.filter((p) => p.status === "active") : [];
}
export function sharedWith(o: SharingOverview | null | undefined, kind: ShareKind, itemId: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (o && o.available) for (const s of o.shares) if (s.kind === kind && s.item_id === itemId) map[s.partnership_id] = s.id;
  return map;
}
