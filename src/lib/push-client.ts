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
