"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { warmOffline } from "@/lib/offline-data";
import { clearOfflineData, WARM_KEY } from "@/lib/offline-store";

const EVERY_MS = 12 * 3_600_000;

/**
 * While online and signed in, keeps the offline copies fresh in the background: the pages that open offline, the
 * loyalty cards and documents with their photos. Runs once per build, per person, per half day, after the screen is
 * usable. If a different person signs in on this phone, the previous person's copies are removed first.
 */
export function OfflineWarm() {
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Pages are kept by the service worker, so wait until it is in charge of this page (it is not, in development)
      if (!("serviceWorker" in navigator)) return;
      await navigator.serviceWorker.ready.catch(() => null);
      if (!navigator.serviceWorker.controller) return;
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId || cancelled || !navigator.onLine) return;
      const stamp = `${process.env.NEXT_PUBLIC_BUILD_ID}:${userId}`;
      let last: { stamp: string; at: number } | null = null;
      try { last = JSON.parse(localStorage.getItem(WARM_KEY) || "null"); } catch { /* ignore */ }
      if (last && last.stamp.split(":")[1] !== userId) await clearOfflineData();
      if (last && last.stamp === stamp && Date.now() - last.at < EVERY_MS) return;
      await warmOffline(supabase, userId).catch(() => {});
      try { localStorage.setItem(WARM_KEY, JSON.stringify({ stamp, at: Date.now() })); } catch { /* private mode */ }
      try { await navigator.storage?.persist?.(); } catch { /* the browser may refuse; that is fine */ }
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return null;
}
