"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that keeps the app and a few pages on the phone. It runs for everyone, in the browser
 * and when installed. In development it is off, because saved development files would hide code changes
 * (the tests turn it on by setting force-sw in local storage).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let forced = false;
    try { forced = localStorage.getItem("force-sw") === "1"; } catch { /* private mode */ }
    if (process.env.NODE_ENV !== "production" && !forced) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
