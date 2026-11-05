import type { Place } from "@/lib/scan-destination";

/**
 * Where the device is right now, as a city and country. Asked only when the person scans, never stored.
 * Returns null when permission is denied, the position is slow, or the lookup fails: the caller then just asks.
 */
export function currentPlace(timeoutMs = 3500): Promise<Place | null> {
  const lookup = new Promise<Place | null>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const res = await fetch(`/api/weather?lat=${p.coords.latitude}&lon=${p.coords.longitude}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
          if (!res.ok) return resolve(null);
          const w = (await res.json()) as { city?: string | null; countryCode?: string | null };
          resolve(w.city || w.countryCode ? { city: w.city ?? null, countryCode: w.countryCode ?? null } : null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: timeoutMs - 500, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false }
    );
  });
  return Promise.race([lookup, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}
