import * as webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export type PushPref = "invites" | "shared" | "views" | "reminders" | "trips" | "support";
export type PushPrefs = Record<PushPref, boolean>;
export const DEFAULT_PUSH_PREFS: PushPrefs = { invites: true, shared: true, views: false, reminders: true, trips: true, support: true };

/** Messages only say that something happened. They never carry card numbers, trip details, names of items or amounts. */
export const PUSH_TEXT = {
  invite: { title: "Lifolio", body: "You have a new sharing invite." },
  accepted: { title: "Lifolio", body: "Your sharing invite was answered." },
  shared: { title: "Lifolio", body: "Something new was shared with you." },
  unshared: { title: "Lifolio", body: "A partner changed what they share with you." },
  ended: { title: "Lifolio", body: "A sharing pairing has ended." },
  view: { title: "Lifolio", body: "A partner opened something you shared." },
  subscription: { title: "Lifolio", body: "A subscription payment is coming up." },
  iptv: { title: "Lifolio", body: "Some IPTV clients are about to expire." },
  trip: { title: "Lifolio", body: "A trip is coming up. Open the app to check your plans." },
  flight: { title: "Lifolio", body: "A flight on your trip changed. Open the app to check it." },
  support: { title: "Lifolio", body: "A new support request arrived." },
  test: { title: "Lifolio", body: "Alerts are working on this device." },
} as const;
export type PushKind = keyof typeof PUSH_TEXT;
const PUSH_URL: Partial<Record<PushKind, string>> = { subscription: "/personal/subscriptions", iptv: "/admin/iptv", trip: "/trips", flight: "/trips", support: "/admin/support" };

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** An endpoint must be an https address; the browser's push service picks it, we only check the shape. */
export function validSubscription(s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  const x = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!x || typeof x.endpoint !== "string" || x.endpoint.length > 1000 || !x.endpoint.startsWith("https://")) return false;
  return typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string" && x.keys.p256dh.length < 200 && x.keys.auth.length < 100;
}

export type PushReason = "ok" | "not_configured" | "no_database" | "no_devices" | "rejected" | "error";
export type PushResult = { sent: number; reason: PushReason; devices: number; status?: number; detail?: string };

/**
 * Sends one alert to every device a person turned on and says why nothing arrived. Never throws: a failed alert must not fail the action that caused it.
 * `pref` is the switch the person has for this kind of alert ("test" ignores the switches).
 */
export async function sendPushDetailed(userId: string | null | undefined, kind: PushKind, pref: PushPref | null): Promise<PushResult> {
  try {
    if (!userId || !pushConfigured()) return { sent: 0, reason: "not_configured", devices: 0 };
    const db = serviceClient();
    if (!db) return { sent: 0, reason: "no_database", devices: 0 };
    if (pref) {
      const { data: p } = await db.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
      const prefs = { ...DEFAULT_PUSH_PREFS, ...((p?.push_prefs as Partial<PushPrefs> | null) ?? {}) };
      if (!prefs[pref]) return { sent: 0, reason: "ok", devices: 0 };
    }
    const { data: subs, error: subsError } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(10);
    if (subsError) { console.error("[push] devices", subsError.message); return { sent: 0, reason: "error", devices: 0, detail: subsError.message.slice(0, 160) }; }
    if (!subs?.length) return { sent: 0, reason: "no_devices", devices: 0 };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const payload = JSON.stringify({ ...PUSH_TEXT[kind], url: PUSH_URL[kind] ?? "/profile", tag: kind });
    let sent = 0;
    let status: number | undefined;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          status = code ?? status;
          console.error("[push] send failed", code ?? (e instanceof Error ? e.message : e));
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }),
    );
    return { sent, reason: sent > 0 ? "ok" : "rejected", devices: subs.length, status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[push]", message);
    return { sent: 0, reason: "error", devices: 0, detail: message.slice(0, 160) };
  }
}

export async function sendPush(userId: string | null | undefined, kind: PushKind, pref: PushPref | null): Promise<number> {
  return (await sendPushDetailed(userId, kind, pref)).sent;
}

/** Looks up one person with a server-only database function (null when there is none or the function is missing). */
export async function pushLookup(fn: string, args: Record<string, unknown>): Promise<string | null> {
  try {
    const db = serviceClient();
    if (!db) return null;
    const { data, error } = await db.rpc(fn, args);
    return error || typeof data !== "string" ? null : data;
  } catch {
    return null;
  }
}
