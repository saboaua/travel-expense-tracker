import { NextResponse } from "next/server";
import { isAllowedPhotoUrl, PHOTO_USER_AGENT } from "@/lib/destination";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Serves a destination photo from Wikimedia through our own address, so the browser never has to reach
 * Wikimedia itself (hotlink limits, blockers and the page's Content-Security-Policy cannot break it) and the
 * picture is cached for a day. Only upload.wikimedia.org addresses are accepted.
 */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("u");
  if (!isAllowedPhotoUrl(src)) return new NextResponse("Not found", { status: 404 });
  try {
    const res = await fetch(src as string, {
      headers: { "User-Agent": PHOTO_USER_AGENT, Accept: "image/*" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
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
