// Run with: npx tsx tests/offline-store.test.ts
import { loadWithCache, memoryKv } from "../src/lib/offline-store";
import { assetUrls } from "../src/lib/offline-warm";
import { readFileSync } from "node:fs";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

(async () => {
  const kv = memoryKv(() => 1000);
  const online = () => true;
  const offline = () => false;

  const fresh = await loadWithCache(kv, "u:cards", async () => ({ data: [{ id: 1 }], error: null }), online);
  eq(fresh, { ok: true, data: [{ id: 1 }], fromCache: false, savedAt: fresh.ok ? fresh.savedAt : 0 }, "online: fresh data is returned");

  let called = 0;
  const off = await loadWithCache(kv, "u:cards", async () => { called++; return { data: null, error: null }; }, offline);
  eq([called, off.ok && off.fromCache, off.ok && off.data, off.ok && off.savedAt], [0, true, [{ id: 1 }], 1000], "offline: the saved copy is used and the network is not asked");

  const down = await loadWithCache(kv, "u:cards", async () => ({ data: null, error: { message: "TypeError: Failed to fetch" } }), online);
  eq(down.ok && down.fromCache, true, "online but unreachable: the saved copy is used");

  const thrown = await loadWithCache(kv, "u:cards", async () => { throw new TypeError("Failed to fetch"); }, online);
  eq(thrown.ok && thrown.fromCache, true, "a thrown network error also falls back");

  const real = await loadWithCache(kv, "u:cards", async () => ({ data: null, error: { code: "42P01", message: "relation \"loyalty_cards\" does not exist" } }), online);
  eq(real.ok, false, "a real database error is never hidden behind old data");

  const denied = await loadWithCache(kv, "u:cards", async () => ({ data: null, error: { code: "42501", message: "permission denied" } }), online);
  eq(denied.ok, false, "a permission error is passed on");

  const none = await loadWithCache(kv, "other:cards", async () => ({ data: null, error: null }), offline);
  eq(none.ok, false, "offline with nothing saved: a clear failure");
  eq(none.ok ? "" : (none.error as Error).message.includes("Open this page once"), true, "…that says what to do");

  eq((await loadWithCache(kv, "u:empty", async () => ({ data: [], error: null }), online)).ok, true, "an empty list is still a result");

  await kv.clear();
  eq(await kv.get("u:cards"), null, "clear removes every saved copy");

  const html = '<script src="/_next/static/chunks/webpack-3fa8c1d2e4b5a6f7.js"></script><link href="/_next/static/css/ab12cd34ef56.css"><script>self.__next_f.push([1,"static/chunks/app/(dashboard)/personal/loyalty/page-0123456789abcdef.js"])</script><script src="/_next/static/chunks/main-app.js?v=1794002907582"></script><img src="/icon.png">';
  eq(assetUrls(html), ["/_next/static/chunks/webpack-3fa8c1d2e4b5a6f7.js", "/_next/static/css/ab12cd34ef56.css", "/_next/static/chunks/app/(dashboard)/personal/loyalty/page-0123456789abcdef.js", "/_next/static/chunks/main-app.js?v=1794002907582"], "page assets are found, including folders with brackets");

  // The service worker and the app must agree on which pages are saved and where
  const sw = readFileSync("public/sw.js", "utf8");
  const warm = readFileSync("src/lib/offline-warm.ts", "utf8");
  const store = readFileSync("src/lib/offline-store.ts", "utf8");
  const list = (src: string) => (src.match(/OFFLINE_PAGES\s*=\s*(\[[^\]]*\])/) || [])[1];
  eq(list(sw), list(warm), "service worker and app list the same offline pages");
  eq(sw.includes(`const PAGES = "${(store.match(/PAGES_CACHE = "([^"]+)"/) || [])[1]}"`), true, "service worker and app use the same page cache name");
})();
