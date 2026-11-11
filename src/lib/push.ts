import * as webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

import { DEFAULT_PUSH_PREFS, normalizePushSettings, PUSH_TZ, type PushPref, type PushPrefs, type PushSettings } from "@/lib/push-prefs";
import { PUSH_TEXT, pushMessage, type PushData, type PushKind } from "@/lib/push-text";
import { inQuietHours, localHour } from "@/lib/telegram-notify";
export { DEFAULT_PUSH_PREFS, PUSH_TEXT };
export type { PushPref, PushPrefs, PushSettings, PushData, PushKind };

const PUSH_URL: Partial<Record<PushKind, string>> = { subscription: "/personal/subscriptions", iptv: "/admin/iptv", trip: "/trips", flight: "/trips", flightTomorrow: "/trips", afterTrip: "/trips", document: "/documents", support: "/admin/support", invite: "/profile#sharing", accepted: "/profile#sharing", shared: "/trips", unshared: "/trips" };

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

export type PushReason = "ok" | "not_configured" | "no_database" | "no_devices" | "rejected" | "error" | "held";
export type PushResult = { sent: number; reason: PushReason; devices: number; status?: number; detail?: string };

export type SendOptions = { now?: Date; today?: string; /** send even in quiet hours (used when sending what was held) */ skipQuiet?: boolean };

/**
 * Sends one alert to every device a person turned on and says why nothing arrived. Never throws: a failed alert must not fail the action that caused it.
 * `pref` is the switch the person has for this kind of alert ("test" ignores the switches). `data` is what the detailed wording may name.
 * In the person's quiet hours the alert is held (saved) and sent by the next daily run instead.
 */
export async function sendPushDetailed(userId: string | null | undefined, kind: PushKind, pref: PushPref | null, data?: PushData, opts: SendOptions = {}): Promise<PushResult> {
  try {
    if (!userId || !pushConfigured()) return { sent: 0, reason: "not_configured", devices: 0 };
    const db = serviceClient();
    if (!db) return { sent: 0, reason: "no_database", devices: 0 };
    let settings: PushSettings = normalizePushSettings(null);
    if (pref) {
      const { data: p } = await db.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
      settings = normalizePushSettings(p?.push_prefs);
      if (!settings[pref]) return { sent: 0, reason: "ok", devices: 0 };
      if (!opts.skipQuiet && settings.quiet.on && inQuietHours(localHour(opts.now ?? new Date(), PUSH_TZ), settings.quiet.start, settings.quiet.end)) {
        const { error: held } = await db.from("push_queue").insert({ user_id: userId, kind, pref, data: data ?? null });
        if (held) console.error("[push] hold", held.message);
        return { sent: 0, reason: "held", devices: 0 };
      }
    }
    const { data: subs, error: subsError } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(10);
    if (subsError) { console.error("[push] devices", subsError.message); return { sent: 0, reason: "error", devices: 0, detail: subsError.message.slice(0, 160) }; }
    if (!subs?.length) return { sent: 0, reason: "no_devices", devices: 0 };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const message = pushMessage(kind, data, settings.detail, opts.today);
    const payload = JSON.stringify({ ...message, url: PUSH_URL[kind] ?? "/profile", tag: kind });
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

export async function sendPush(userId: string | null | undefined, kind: PushKind, pref: PushPref | null, data?: PushData, opts?: SendOptions): Promise<number> {
  return (await sendPushDetailed(userId, kind, pref, data, opts)).sent;
}

const word = (v: unknown) => (typeof v === "string" ? v.trim().split(/\s+/)[0] : "");

/** First name of a person, for the detailed wording (empty when unknown). */
export async function pushName(userId: string | null | undefined): Promise<string> {
  try {
    const db = serviceClient();
    if (!db || !userId) return "";
    const { data } = await db.from("profiles").select("first_name, full_name").eq("id", userId).maybeSingle();
    return word(data?.first_name) || word(data?.full_name);
  } catch {
    return "";
  }
}

/** The name of a shared card or trip (never a number or any other detail). */
export async function pushItemTitle(kind: string, itemId: string): Promise<string> {
  try {
    const db = serviceClient();
    if (!db) return "";
    if (kind === "trip") return String((await db.from("trips").select("name").eq("id", itemId).maybeSingle()).data?.name ?? "");
    if (kind === "personal_trip") return String((await db.from("personal_projects").select("name").eq("id", itemId).maybeSingle()).data?.name ?? "");
    if (kind === "loyalty_card") return String((await db.from("loyalty_cards").select("store_name").eq("id", itemId).maybeSingle()).data?.store_name ?? "");
    return "";
  } catch {
    return "";
  }
}

/** What a share points at, looked up before it is removed. */
export async function pushShareItem(shareId: string): Promise<{ kind: string; item: string }> {
  try {
    const db = serviceClient();
    if (!db) return { kind: "", item: "" };
    const { data } = await db.from("shares").select("kind, item_id").eq("id", shareId).maybeSingle();
    if (!data) return { kind: "", item: "" };
    return { kind: String(data.kind), item: await pushItemTitle(String(data.kind), String(data.item_id)) };
  } catch {
    return { kind: "", item: "" };
  }
}

/** True the first time a reminder key is seen for a person (so a daily job never sends the same reminder twice). */
export async function claimOnce(userId: string, key: string): Promise<boolean> {
  try {
    const db = serviceClient();
    if (!db) return false;
    const { error } = await db.from("push_sent_log").insert({ user_id: userId, dedupe_key: key.slice(0, 200) });
    if (!error) return true;
    if (!/duplicate|unique|23505/i.test(error.message + (error.code ?? ""))) console.error("[push] claim", error.message);
    return false;
  } catch {
    return false;
  }
}

/** Sends the alerts that were held in quiet hours, for everyone whose quiet hours are over. Old ones (over a day) are dropped. */
export async function flushHeldPushes(now: Date = new Date(), today?: string): Promise<{ sent: number; dropped: number }> {
  const out = { sent: 0, dropped: 0 };
  const db = serviceClient();
  if (!db) return out;
  const { data, error } = await db.from("push_queue").select("id, user_id, kind, pref, data, created_at").order("created_at").limit(500);
  if (error || !data?.length) return out;
  const cutoff = now.getTime() - 24 * 3600_000;
  const quietNow = new Map<string, boolean>();
  for (const r of data) {
    if (new Date(String(r.created_at)).getTime() < cutoff) { await db.from("push_queue").delete().eq("id", r.id); out.dropped++; continue; }
    const uid = String(r.user_id);
    if (!quietNow.has(uid)) {
      const { data: p } = await db.from("profiles").select("push_prefs").eq("id", uid).maybeSingle();
      const st = normalizePushSettings(p?.push_prefs);
      quietNow.set(uid, st.quiet.on && inQuietHours(localHour(now, PUSH_TZ), st.quiet.start, st.quiet.end));
    }
    if (quietNow.get(uid)) continue; // still quiet: keep it for the next run
    await db.from("push_queue").delete().eq("id", r.id);
    out.sent += await sendPush(uid, r.kind as PushKind, (r.pref as PushPref) ?? null, (r.data as PushData | null) ?? undefined, { now, today, skipQuiet: true });
  }
  return out;
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
