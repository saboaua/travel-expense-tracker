import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWeather, parseCoords } from "@/lib/weather";

export const dynamic = "force-dynamic";

/**
 * Weather for the signed-in user's current position.
 * Uses the coordinates the browser sends (GPS/Wi-Fi). If they are not provided (permission denied),
 * falls back to the approximate location Vercel derives from the IP address.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  let coords = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  let hint: { city?: string | null; countryCode?: string | null } = {};
  let source: "device" | "ip" = "device";

  if (!coords) {
    const h = request.headers;
    coords = parseCoords(h.get("x-vercel-ip-latitude"), h.get("x-vercel-ip-longitude"));
    const city = h.get("x-vercel-ip-city");
    hint = { city: city ? decodeURIComponent(city) : null, countryCode: h.get("x-vercel-ip-country") };
    source = "ip";
  }
  if (!coords) return NextResponse.json({ error: "Location unavailable" }, { status: 404 });

  try {
    const weather = await fetchWeather(coords.lat, coords.lon, source === "ip" ? hint : {});
    return NextResponse.json({ ...weather, source }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.error("[weather]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Weather unavailable" }, { status: 502 });
  }
}
