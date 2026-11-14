import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Supermarkets around a point, from OpenStreetMap (open data, © OpenStreetMap contributors). Used only when the person taps
 * "Find supermarkets near me". Nothing from Google Maps is read or kept.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const la = Number(url.searchParams.get("lat")), lo = Number(url.searchParams.get("lon"));
  const c = Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && url.searchParams.get("lat") ? { lat: la, lon: lo } : null;
  if (!c) return NextResponse.json({ error: "Position needed" }, { status: 400 });
  const km = Math.min(15, Math.max(1, Number(url.searchParams.get("km")) || 5));

  const q = `[out:json][timeout:20];nwr["shop"~"^(supermarket|convenience|wholesale|greengrocer)$"](around:${Math.round(km * 1000)},${c.lat},${c.lon});out center 60;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Lifolio/1.0 (store finder)" },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ error: "Map data is busy. Try again in a minute." }, { status: 502 });
    const j = (await res.json()) as { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    const stores = (j.elements ?? []).flatMap((e) => {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, name = e.tags?.name?.trim();
      return name && lat != null && lng != null ? [{ osmId: `${e.type}/${e.id}`, name: name.slice(0, 120), lat, lng }] : [];
    });
    return NextResponse.json({ stores, attribution: "© OpenStreetMap contributors" }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Could not reach the map data. Try again later." }, { status: 502 });
  }
}
