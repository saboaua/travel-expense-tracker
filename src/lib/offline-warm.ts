/** Pages that open with no connection. The service worker keeps these (public/sw.js lists the same ones). */
export const OFFLINE_PAGES = ["/personal/loyalty", "/documents", "/personal", "/pending"];

/** Trip pages are kept as they are visited, and the recent ones ahead of time (public/sw.js has the same pattern). */
export const KEPT_PAGE = /^\/(?:trips(?:\/new|\/[0-9a-f-]{36}(?:\/(?:edit|add-expense|expenses\/[0-9a-f-]{36}))?)?|personal\/(?:projects|travel)(?:\/new|\/[0-9a-f-]{36}(?:\/(?:edit|expense(?:\/[0-9a-f-]{36})?))?)?|personal\/groceries(?:\/new|\/prices|\/[0-9a-f-]{36}(?:\/edit)?)?)$/;

// Script, style and font files a page needs (hashed in production, with a ?v= stamp in development). They show up in the page's HTML, with or without the /_next/ prefix.
const ASSET = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>]+\.(?:js|css|woff2)(?:\?[^"'\\\s<>]*)?/g;

/** The hashed files a page's HTML points to, as URLs on this site. */
export function assetUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(ASSET)) out.add(m[0].startsWith("/") ? m[0] : `/_next/${m[0]}`);
  return [...out];
}

/** Opens each offline page once while online, so the service worker saves it and every file it needs. */
export async function warmPages(pages: string[] = OFFLINE_PAGES): Promise<void> {
  for (const page of pages) {
    try {
      const res = await fetch(page, { headers: { "x-offline-warm": "1" }, credentials: "same-origin" });
      if (!res.ok || res.redirected) continue;
      const html = await res.text();
      await Promise.all(assetUrls(html).map((a) => fetch(a).then((r) => r.arrayBuffer()).catch(() => {})));
    } catch {
      // offline or signed out: nothing to keep
    }
  }
}
