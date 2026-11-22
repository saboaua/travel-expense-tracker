import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { overpassQuery, rankPlaces, type OsmElement, type Place } from "@/lib/trip-places";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA = "Lifolio/1.0 (trip places)";
const WEEK = 7 * 24 * 3600;

async function geocode(dest: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(dest)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(8000), next: { revalidate: 30 * 24 * 3600 },
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => [])) as { lat?: string; lon?: string }[];
  const lat = Number(j[0]?.lat), lon = Number(j[0]?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function overpass(q: string): Promise<OsmElement[] | null> {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: `data=${encodeURIComponent(q)}`, signal: AbortSignal.timeout(22000), next: { revalidate: WEEK },
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { elements?: OsmElement[] } | null;
  return j?.elements ?? null;
}

/** The top 10 things to do and the top 10 places to eat around a trip's destination (OpenStreetMap). Cached for a week per destination. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`places:${user.id}`, 60, 3600))) return NextResponse.json({ error: "Too many lookups" }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const dest = (q.get("dest") || "").trim().slice(0, 120);
  if (dest.length < 2) return NextResponse.json({ error: "Destination needed" }, { status: 400 });
  const trip = /^[0-9a-f-]{36}$/i.test(q.get("trip") || "") ? (q.get("trip") as string) : null;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(q.get("end") || "") ? (q.get("end") as string) : null;

  // Saved for the trip: the map service is asked once, and the row goes the day after the trip ends. All of this is skipped when the table is not set up.
  if (trip && end) {
    await supabase.from("trip_places").delete().lt("trip_end", new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    const { data: saved } = await supabase.from("trip_places").select("destination, things, eat, fetched_at").eq("trip_id", trip).maybeSingle();
    if (saved && saved.destination === dest && Date.now() - Date.parse(saved.fetched_at) < 30 * 86400000 && (saved.things?.length || saved.eat?.length)) {
      return NextResponse.json({ things: saved.things, eat: saved.eat, attribution: "© OpenStreetMap contributors" }, { headers: { "Cache-Control": "private, max-age=600" } });
    }
  }

  const c = await geocode(dest);
  if (!c) return NextResponse.json({ things: [] as Place[], eat: [] as Place[], attribution: "© OpenStreetMap contributors" });
  const [t, e] = await Promise.all([overpass(overpassQuery("things", c)), overpass(overpassQuery("eat", c))]);
  if (!t && !e) return NextResponse.json({ error: "Map data is busy" }, { status: 502 });
  const things = rankPlaces("things", t ?? [], c), eat = rankPlaces("eat", e ?? [], c);
  if (trip && end && (things.length || eat.length)) {
    await supabase.from("trip_places").upsert({ user_id: user.id, trip_id: trip, destination: dest, trip_end: end, things, eat, fetched_at: new Date().toISOString() }, { onConflict: "user_id,trip_id" });
  }
  return NextResponse.json({ things, eat, attribution: "© OpenStreetMap contributors" }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
