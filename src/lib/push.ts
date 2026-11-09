import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export type PushPref = "invites" | "shared" | "views";
export type PushPrefs = Record<PushPref, boolean>;
export const DEFAULT_PUSH_PREFS: PushPrefs = { invites: true, shared: true, views: false };

/** Messages only say that something happened. They never carry card numbers, trip details, names of items or amounts. */
export const PUSH_TEXT = {
  invite: { title: "Lifolio", body: "You have a new sharing invite." },
  accepted: { title: "Lifolio", body: "Your sharing invite was answered." },
  shared: { title: "Lifolio", body: "Something new was shared with you." },
  unshared: { title: "Lifolio", body: "A partner changed what they share with you." },
  ended: { title: "Lifolio", body: "A sharing pairing has ended." },
  view: { title: "Lifolio", body: "A partner opened something you shared." },
  test: { title: "Lifolio", body: "Alerts are working on this device." },
} as const;
export type PushKind = keyof typeof PUSH_TEXT;

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

/**
 * Sends one alert to every device a person turned on. Never throws: a failed alert must not fail the action that caused it.
 * `pref` is the switch the person has for this kind of alert ("test" ignores the switches).
 */
export async function sendPush(userId: string | null | undefined, kind: PushKind, pref: PushPref | null): Promise<number> {
  try {
    if (!userId || !pushConfigured()) return 0;
    const db = serviceClient();
    if (!db) return 0;
    if (pref) {
      const { data: p } = await db.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
      const prefs = { ...DEFAULT_PUSH_PREFS, ...((p?.push_prefs as Partial<PushPrefs> | null) ?? {}) };
      if (!prefs[pref]) return 0;
    }
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(10);
    if (!subs?.length) return 0;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const payload = JSON.stringify({ ...PUSH_TEXT[kind], url: kind === "test" ? "/profile" : "/profile", tag: kind });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }),
    );
    return sent;
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
    return 0;
  }
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
