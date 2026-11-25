/** Which alerts go to Telegram. Pure (no I/O) so the page, the API and the senders agree, and it can be tested. */
import { PUSH_PREF_KEYS, type PushPref, type PushSettings } from "@/lib/push-prefs";

/** Every phone alert, plus the weekly summary, which only exists in Telegram. */
export const TELEGRAM_KEYS = [...PUSH_PREF_KEYS, "summary"] as const;
export type TelegramKey = (typeof TELEGRAM_KEYS)[number];
export type TelegramKinds = Record<TelegramKey, boolean>;

/** Alerts only an admin sees. */
export const ADMIN_KEYS: readonly TelegramKey[] = ["support", "accountRequests", "iptv"];
/** Alerts Telegram already sent before each one had its own switch (trip reminders, document expiry, weekly summary). They follow the old switch. */
const TRIP_KEYS: readonly TelegramKey[] = ["trips", "documents", "summary"];

/**
 * What a person has chosen. Anything never chosen: the old three kinds follow the switch they had, everything else starts off,
 * so nobody gets a flood of new messages.
 */
export function normalizeKinds(saved: unknown, legacy: { trip_reminders: boolean; admin_alerts: boolean }): TelegramKinds {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const out = {} as TelegramKinds;
  for (const k of TELEGRAM_KEYS) {
    out[k] = typeof s[k] === "boolean" ? (s[k] as boolean) : TRIP_KEYS.includes(k) ? legacy.trip_reminders : ADMIN_KEYS.includes(k) ? legacy.admin_alerts : false;
  }
  return out;
}

/** A partial change from the page: only known keys with true or false. Null when something is the wrong type or nothing is left. */
export function parseKindsPatch(body: unknown): Partial<TelegramKinds> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: Partial<TelegramKinds> = {};
  for (const k of TELEGRAM_KEYS) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") return null;
    out[k] = b[k] as boolean;
  }
  return Object.keys(out).length ? out : null;
}

/** The keys a person can see: admin alerts only for an admin. */
export function visibleKeys(isAdmin: boolean): TelegramKey[] {
  return TELEGRAM_KEYS.filter((k) => isAdmin || !ADMIN_KEYS.includes(k));
}

export function countOn(kinds: TelegramKinds, isAdmin: boolean): { on: number; total: number } {
  const keys = visibleKeys(isAdmin);
  return { on: keys.filter((k) => kinds[k]).length, total: keys.length };
}

/** "Copy my phone choices": Telegram gets the same on/off as the phone for every alert. The weekly summary has no phone switch, so it stays as it is. */
export function copyPhoneChoices(phone: Pick<PushSettings, PushPref>, current: TelegramKinds): TelegramKinds {
  const out = { ...current };
  for (const k of PUSH_PREF_KEYS) out[k] = phone[k];
  return out;
}

/** The old switches stay in step, for the senders that still read them. */
export function legacyFlags(kinds: TelegramKinds): { trip_reminders: boolean; admin_alerts: boolean } {
  return { trip_reminders: kinds.trips || kinds.documents || kinds.summary, admin_alerts: kinds.support || kinds.accountRequests || kinds.iptv };
}
