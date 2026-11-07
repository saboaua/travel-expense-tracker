// Service worker: keeps the app usable with no connection.
//  - Static files (scripts, styles, fonts, icons): kept on the phone. Files with a hash in their name never change, so
//    they are served from the phone first; other files are fetched first and the saved copy is the fallback.
//  - A few pages (see OFFLINE_PAGES) are saved after they load, so they open with no connection. The network is
//    asked first, so online you always get the latest page.
//  - Anything else offline gets a small page that links to the saved ones.
// Saved pages are removed at sign-out (see clearOfflineData in src/lib/offline-store.ts).

const CACHE = "expense-tracker-v6";
const PAGES = "expense-pages-v1"; // keep in step with PAGES_CACHE in src/lib/offline-store.ts
const OFFLINE_PAGES = ["/personal/loyalty", "/documents", "/personal", "/pending"]; // keep in step with src/lib/offline-warm.ts
// Trip pages are kept as they are visited (and the recent ones ahead of time); keep in step with KEPT_PAGE in src/lib/offline-warm.ts
const KEPT_PAGE = /^\/(?:trips(?:\/new|\/[0-9a-f-]{36}(?:\/(?:edit|add-expense|expenses\/[0-9a-f-]{36}))?)?|personal\/(?:projects|travel)(?:\/new|\/[0-9a-f-]{36}(?:\/(?:edit|expense(?:\/[0-9a-f-]{36})?))?)?|personal\/groceries(?:\/new|\/prices|\/[0-9a-f-]{36}(?:\/edit)?)?)$/;
const MAX_TRIP_PAGES = 150;
const SLOW_NETWORK_MS = 6000;
const isKept = (pathname) => OFFLINE_PAGES.includes(pathname) || KEPT_PAGE.test(pathname);

const HASHED = /[-.][0-9a-f]{8,}\.(?:js|css|woff2?)$/;

const hubPage = () =>
  new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head>' +
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff;color:#374151;text-align:center;padding:24px">' +
      '<div style="max-width:20rem"><h1 style="font-size:20px;margin:0 0 8px">You are offline</h1>' +
      '<p style="margin:0 0 16px">This page needs a connection. These are saved on your phone:</p>' +
      '<a href="/personal/loyalty" style="display:block;margin:0 0 10px;padding:12px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Loyalty cards</a>' +
      '<a href="/documents" style="display:block;margin:0 0 10px;padding:12px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Documents</a>' +
      '<a href="/trips" style="display:block;margin:0 0 10px;padding:12px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Trips</a>' +
      '<a href="/personal/projects" style="display:block;margin:0 0 10px;padding:12px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Home projects</a>' +
      '<a href="/personal/groceries" style="display:block;margin:0 0 10px;padding:12px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Groceries</a>' +
      '<p style="margin:16px 0 0;font-size:14px">Receipts you save offline are sent when you are back online.</p></div></body></html>',
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Only the manifest: "/" needs a sign-in, so caching it would store a redirect to the login page
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/manifest.json")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Start the page request while the worker is still waking up, which shortens the blank moment when the app opens
      self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : null,
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PAGES).map((k) => caches.delete(k)))),
    ]).then(() => self.clients.claim())
  );
});

/** A page worth keeping: a normal, signed-in answer, not a redirect to the login page or an error. */
function storable(res) {
  return res && res.ok && !res.redirected && res.type === "basic" && (res.headers.get("content-type") || "").includes("text/html");
}

function keepPage(event, pathname, res) {
  const copy = res.clone();
  const job = caches.open(PAGES).then(async (c) => {
    await c.put(pathname, copy);
    // Keep the saved trip pages to a sensible number: drop the oldest first
    const trips = (await c.keys()).filter((r) => KEPT_PAGE.test(new URL(r.url).pathname));
    for (const r of trips.slice(0, Math.max(0, trips.length - MAX_TRIP_PAGES))) await c.delete(r);
  });
  try { event.waitUntil(job); } catch { /* the page already finished; the copy is still saved */ }
}

async function openPage(event) {
  const req = event.request;
  const url = new URL(req.url);
  const keep = url.origin === self.location.origin && isKept(url.pathname);
  const network = (event.preloadResponse ? event.preloadResponse.then((r) => r || fetch(req)) : fetch(req))
    .then((res) => { if (keep && storable(res)) keepPage(event, url.pathname, res); return res; })
    .catch(() => null);
  if (!keep) return (await network) || hubPage();

  const saved = await caches.open(PAGES).then((c) => c.match(url.pathname, { ignoreVary: true }));
  if (!saved) return (await network) || hubPage();
  // A saved copy exists: if the network is slow or down, show it instead of waiting
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(() => resolve(null), SLOW_NETWORK_MS); });
  const res = await Promise.race([network, slow]);
  clearTimeout(timer);
  return res || saved;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(openPage(event));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The app asks for an offline page in the background so it is saved before it is needed
  if (req.headers.get("x-offline-warm") && isKept(url.pathname)) {
    event.respondWith(
      fetch(req).then((res) => { if (storable(res)) keepPage(event, url.pathname, res); return res; })
    );
    return;
  }

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".png") || url.pathname === "/manifest.json";
  if (!isStatic) return;
  const store = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  if (HASHED.test(url.pathname) || url.pathname.endsWith(".png") || url.pathname === "/manifest.json") {
    // Hashed files never change: the phone's copy first
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then(store)));
  } else {
    // Files that can change (development builds, for one): fresh when online, the saved copy when not
    event.respondWith(fetch(req).then(store).catch(() => caches.match(req).then((cached) => cached || Response.error())));
  }
});
