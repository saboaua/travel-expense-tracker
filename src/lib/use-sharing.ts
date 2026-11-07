"use client";

import { useCallback, useEffect, useState } from "react";
import type { SharingOverview } from "@/lib/sharing";
import { useAccess } from "@/lib/use-access";

/** One shared copy of the sharing overview per page, so the profile, the popups and the "Share with" rows agree. */
let cached: SharingOverview | null = null;
let inflight: Promise<SharingOverview> | null = null;
const listeners = new Set<(o: SharingOverview) => void>();

export async function loadSharing(force = false): Promise<SharingOverview> {
  if (!force && cached) return cached;
  if (!inflight) {
    inflight = fetch("/api/sharing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .catch(() => ({ available: false }))
      .then((o: SharingOverview) => {
        cached = o && typeof o === "object" && "available" in o ? o : { available: false };
        listeners.forEach((l) => l(cached as SharingOverview));
        return cached;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Forget everything at sign-out so the next person on this device never sees it. */
export function resetSharingCache() {
  cached = null;
  inflight = null;
}

export function useSharing(): { overview: SharingOverview | null; refresh: () => Promise<SharingOverview> } {
  // Only roles that have the Partner sharing option ask at all, so everyone else costs no extra request
  const access = useAccess();
  const allowed = access.loaded && access.perms.has("sharing");
  const [overview, setOverview] = useState<SharingOverview | null>(allowed ? cached : null);
  useEffect(() => {
    if (!allowed) return;
    const l = (o: SharingOverview) => setOverview(o);
    listeners.add(l);
    loadSharing().then(setOverview);
    return () => { listeners.delete(l); };
  }, [allowed]);
  const refresh = useCallback(() => loadSharing(true), []);
  return { overview: allowed ? overview : null, refresh };
}

/** Sends one sharing action. Returns the person-safe message on failure. */
export async function sharingAction(path: string, body: Record<string, unknown>): Promise<{ ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const r = await fetch(`/api/sharing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Sharing hit a problem. Please try again." };
    return { ok: true, message: typeof data.message === "string" ? data.message : undefined, data };
  } catch {
    return { ok: false, error: "You seem to be offline. Try again when you are connected." };
  }
}
