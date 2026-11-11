/** What a person can choose about phone alerts. Pure (no I/O) so the page, the API and the senders agree, and it can be tested. */

export const PUSH_PREF_KEYS = ["invites", "shared", "views", "reminders", "iptv", "trips", "flights", "flightTomorrow", "afterTrip", "documents", "support"] as const;
export type PushPref = (typeof PUSH_PREF_KEYS)[number];
export type PushPrefs = Record<PushPref, boolean>;
export type PushDetail = "details" | "private";
export type QuietHours = { on: boolean; start: number; end: number };
export type PushSettings = PushPrefs & { detail: PushDetail; quiet: QuietHours };

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  invites: true, shared: true, views: false, reminders: true, iptv: true, trips: true, flights: true, flightTomorrow: true, afterTrip: true, documents: true, support: true,
};
export const DEFAULT_PUSH_SETTINGS: PushSettings = { ...DEFAULT_PUSH_PREFS, detail: "details", quiet: { on: false, start: 22, end: 7 } };

/** The time zone quiet hours are counted in (the same one Telegram quiet hours use). */
export const PUSH_TZ = "America/Aruba";

const hour = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : d);

/**
 * Merge what is saved over the defaults. A switch that did not exist before follows the older switch it came from, so nobody
 * gets alerts they had turned off: Flight changes follows Trips, IPTV follows Payment reminders.
 */
export function normalizePushSettings(saved: unknown): PushSettings {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const out: PushSettings = { ...DEFAULT_PUSH_SETTINGS, quiet: { ...DEFAULT_PUSH_SETTINGS.quiet } };
  for (const k of PUSH_PREF_KEYS) if (typeof s[k] === "boolean") out[k] = s[k] as boolean;
  if (typeof s.flights !== "boolean" && typeof s.trips === "boolean") out.flights = s.trips;
  if (typeof s.iptv !== "boolean" && typeof s.reminders === "boolean") out.iptv = s.reminders;
  if (s.detail === "private" || s.detail === "details") out.detail = s.detail;
  const q = s.quiet as Partial<QuietHours> | undefined;
  if (q && typeof q === "object") out.quiet = { on: q.on === true, start: hour(q.start, 22), end: hour(q.end, 7) };
  return out;
}

/** A partial change from the page: only valid fields are taken. Returns null when something is the wrong type. */
export function parsePushPatch(body: unknown): Partial<PushSettings> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: Partial<PushSettings> = {};
  for (const k of PUSH_PREF_KEYS) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") return null;
    out[k] = b[k] as boolean;
  }
  if (b.detail !== undefined) {
    if (b.detail !== "details" && b.detail !== "private") return null;
    out.detail = b.detail;
  }
  if (b.quiet !== undefined) {
    const q = b.quiet as Partial<QuietHours> | null;
    if (!q || typeof q !== "object" || typeof q.on !== "boolean") return null;
    const ok = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
    if (!ok(q.start) || !ok(q.end)) return null;
    out.quiet = { on: q.on, start: q.start as number, end: q.end as number };
  }
  return Object.keys(out).length ? out : null;
}

/** "10:00 PM" for an hour 0-23. */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
