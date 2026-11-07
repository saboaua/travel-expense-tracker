import { NextResponse } from "next/server";
import { getLogoUrl } from "@/lib/brand-icon";
import { toIconPng } from "@/lib/icon-image";

export const dynamic = "force-dynamic";

const SIZES = [120, 152, 167, 180, 192, 512];

/**
 * The app icon: the uploaded logo as a square PNG on white, which is what iPhones and Android need
 * (they ignore SVG and WebP, and fill transparent corners with black). Without a logo it sends the built-in icon.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const asked = Number(url.searchParams.get("size"));
  const size = SIZES.includes(asked) ? asked : 512;
  // With ?v= the address changes whenever the logo does, so it can be kept for a day
  const cache = url.searchParams.has("v") ? "public, max-age=86400" : "public, max-age=300";
  try {
    const logoUrl = await getLogoUrl();
    if (logoUrl) {
      const res = await fetch(logoUrl, { cache: "no-store" });
      if (res.ok) {
        const input = Buffer.from(await res.arrayBuffer());
        try {
          const png = await toIconPng(input, size);
          return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": cache } });
        } catch {
          // The image could not be converted: send it as it is
          return new NextResponse(new Uint8Array(input), { headers: { "Content-Type": res.headers.get("content-type") || "image/png", "Cache-Control": cache } });
        }
      }
    }
  } catch {
    // fall through to the built-in icon
  }
  return NextResponse.redirect(new URL(size >= 512 ? "/icon-512.png" : "/icon-192.png", request.url));
}
