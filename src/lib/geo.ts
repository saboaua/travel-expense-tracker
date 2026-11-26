/**
 * Where the device is, asked for as little as possible. A phone that was located a few minutes ago on any screen is not asked again:
 * the last fix is kept on the device and shared by every screen, and two screens asking at once share one question.
 */
export type Fix = { lat: number; lng: number; at: number };

const KEY = "lifolio:last-fix";
/** A fix this young is used as it is. */
export const FIX_FRESH_MS = 10 * 60 * 1000;

/** The last fix, when it is young enough. Never asks the browser anything. */
export function lastFix(maxAgeMs = FIX_FRESH_MS, now = Date.now()): Fix | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Fix> | null;
    if (!v || typeof v.lat !== "number" || typeof v.lng !== "number" || typeof v.at !== "number") return null;
    if (Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
    return now - v.at <= maxAgeMs && v.at <= now + 60_000 ? { lat: v.lat, lng: v.lng, at: v.at } : null;
  } catch { return null; }
}

/** Keep a fix so the next screen does not have to ask. */
export function rememberFix(lat: number, lng: number): void {
  try { localStorage.setItem(KEY, JSON.stringify({ lat, lng, at: Date.now() })); } catch { /* private mode: it just asks next time */ }
}

let inflight: Promise<Fix | null> | null = null;

/** A recent fix straight away, otherwise the browser's own question (once, even when several screens ask). Null when refused or unavailable. */
export function getFix(o: { maxAgeMs?: number; timeoutMs?: number } = {}): Promise<Fix | null> {
  const known = lastFix(o.maxAgeMs);
  if (known) return Promise.resolve(known);
  if (inflight) return inflight;
  const run = new Promise<Fix | null>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { rememberFix(p.coords.latitude, p.coords.longitude); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }); },
      () => resolve(null),
      { timeout: o.timeoutMs ?? 8000, maximumAge: o.maxAgeMs ?? FIX_FRESH_MS, enableHighAccuracy: false },
    );
  });
  inflight = run;
  void run.then(() => { if (inflight === run) inflight = null; });
  return run;
}
