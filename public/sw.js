// Minimal service worker so the app meets PWA install criteria.
// Network-first for pages (with a small offline notice); cache-first for same-origin static files.

const CACHE = "expense-tracker-v2";

const OFFLINE_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff;color:#374151;text-align:center;padding:24px">' +
  "<div><h1 style=\"font-size:20px;margin:0 0 8px\">You are offline</h1><p style=\"margin:0\">Check your connection and open the app again. Receipts you saved offline will sync when you are back online.</p></div></body></html>";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Only the manifest: "/" needs a sign-in, so caching it would store a redirect to the login page
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/manifest.json")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Pages: network first. Offline: a short notice instead of the browser's error page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }))
    );
    return;
  }

  // Same-origin static files: cache first
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".png") || url.pathname === "/manifest.json")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }))
    );
  }
});
