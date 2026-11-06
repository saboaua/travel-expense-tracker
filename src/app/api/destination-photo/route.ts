import { NextResponse } from "next/server";
import { isAllowedPhotoUrl, PHOTO_USER_AGENT } from "@/lib/destination";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Serves a destination photo from Wikimedia through our own address, so the browser never has to reach
 * Wikimedia itself (hotlink limits, blockers and the page's Content-Security-Policy cannot break it) and the
 * picture is cached for a day. Only upload.wikimedia.org addresses are accepted.
 */
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** For finding out why a photo does not show: /api/destination-photo?debug=Panama reports each step as JSON. */
async function diagnose(place: string) {
  const out: Record<string, unknown> = { place };
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: place, gsrlimit: "3", redirects: "1", prop: "pageimages", piprop: "thumbnail", pithumbsize: "1280" }).toString();
    const r = await fetch(url, { headers: { "User-Agent": PHOTO_USER_AGENT, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    out.searchStatus = r.status;
    const json = (await r.json()) as { query?: { pages?: { title: string; thumbnail?: { source: string } }[] } };
    const pages = json.query?.pages || [];
    out.pages = pages.map((p) => ({ title: p.title, thumbnail: p.thumbnail?.source ?? null }));
    const img = pages.find((p) => p.thumbnail)?.thumbnail?.source;
    if (img) {
      const tries: Record<string, unknown> = {};
      for (const [name, headers] of Object.entries<Record<string, string>>({
        ourUserAgent: { "User-Agent": PHOTO_USER_AGENT, Accept: "image/*" },
        browserUserAgent: { "User-Agent": BROWSER_UA, Accept: "image/*" },
        browserWithReferer: { "User-Agent": BROWSER_UA, Accept: "image/*", Referer: "https://en.wikipedia.org/" },
      })) {
        try {
          const ir = await fetch(img, { headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000) });
          tries[name] = { status: ir.status, type: ir.headers.get("content-type"), length: ir.headers.get("content-length"), location: ir.headers.get("location") };
        } catch (e) {
          tries[name] = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      out.imageFetch = tries;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const debug = params.get("debug");
  if (debug) return NextResponse.json(await diagnose(debug.slice(0, 80)), { headers: { "Cache-Control": "no-store" } });
  const src = params.get("u");
  if (!isAllowedPhotoUrl(src)) return new NextResponse("Not found", { status: 404 });
  try {
    const res = await fetch(src as string, {
      headers: { "User-Agent": PHOTO_USER_AGENT, Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!isAllowedPhotoUrl(res.url)) return new NextResponse("Not found", { status: 404 }); // a redirect must stay on Wikimedia
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return new NextResponse("Not found", { status: 404 });
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(bytes, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
