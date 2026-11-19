import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCoords } from "@/lib/weather";
import { normCountry } from "@/lib/country";

export const dynamic = "force-dynamic";

/**
 * The country the signed-in person is in, as a two-letter code. From the coordinates the phone sends when it has them,
 * otherwise from the country Vercel reads from the network address. No other place details are looked up or kept.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const coords = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (coords) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const c = normCountry(((await r.json()) as { countryCode?: string }).countryCode);
        if (c) return NextResponse.json({ countryCode: c, source: "device" }, { headers: { "Cache-Control": "private, max-age=300" } });
      }
    } catch { /* fall back to the network address */ }
  }
  const ip = normCountry(request.headers.get("x-vercel-ip-country"));
  if (!ip) return NextResponse.json({ error: "Country unavailable" }, { status: 404 });
  return NextResponse.json({ countryCode: ip, source: "ip" }, { headers: { "Cache-Control": "private, max-age=300" } });
}
