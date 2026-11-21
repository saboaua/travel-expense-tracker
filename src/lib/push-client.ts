/** Browser side of phone alerts. Everything here is safe to call where push does not exist: it just says "unsupported". */
export type PushSupport = "unsupported" | "needs-install" | "ok";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "needs-install"; // iPhone and iPad only allow alerts from the Home Screen app
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ok" : "unsupported";
}

export function keyToBytes(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Whether the server has a row for this phone's subscription. */
export async function isRegistered(endpoint: string): Promise<boolean> {
  const r = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return true; // cannot tell (offline): do not claim it is broken
  return Boolean((await r.json().catch(() => ({}))).registered);
}

/** Asks for permission if needed, subscribes this phone, saves it on the server and remembers that you want alerts. Needs a tap (iOS). */
export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const k = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json());
    if (!k.configured) return { ok: false, error: "Alerts are not set up on the server yet." };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "Alerts are blocked for this app. Switch them on in your phone's Settings, then try again." };
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.key) as BufferSource }));
    const r = await post("/api/push/subscribe", { subscription: sub.toJSON() });
    if (!r.ok) return { ok: false, error: "Could not save this device. Please try again." };
    await post("/api/push/prefs", { prefs: { wanted: true } }).catch(() => null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not turn alerts on." };
  }
}

/** Quiet repair when permission is already granted: re-creates a dropped subscription and re-saves it. No tap needed. Returns whether this device is now registered. */
export async function healPush(): Promise<boolean> {
  try {
    if (pushSupport() !== "ok" || Notification.permission !== "granted") return false;
    const k = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json());
    if (!k.configured) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.key) as BufferSource }));
    return (await post("/api/push/subscribe", { subscription: sub.toJSON() })).ok;
  } catch {
    return false;
  }
}

/** Sign-out: this device stops getting your alerts (the phone's permission stays, and signing back in re-saves it). Call before signing out. */
export async function releaseDevice(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sub = await currentSubscription();
    if (sub) await post("/api/push/unsubscribe", { endpoint: sub.endpoint, keepWanted: true });
  } catch { /* signing out must never wait on this */ }
}
