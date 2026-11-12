import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fetchTripDays, findPlace, forecastWindow } from "@/lib/trip-weather";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Forecast for the days of one trip. Only the place name and the dates leave the app. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`tripweather:${user.id}`, 120, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const q = new URL(request.url).searchParams;
  const destination = (q.get("destination") || "").trim().slice(0, 120);
  const start = q.get("start") || "";
  const end = q.get("end") || "";
  if (!destination || !DATE.test(start) || (end && !DATE.test(end))) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const win = forecastWindow(start, end || null, todayISO());
  if (win.status !== "ok") return NextResponse.json(win, { headers: { "Cache-Control": "private, max-age=3600" } });

  try {
    const place = await findPlace(destination);
    if (!place) return NextResponse.json({ status: "nolocation" }, { headers: { "Cache-Control": "private, max-age=600" } });
    const days = await fetchTripDays(place, win.start, win.end);
    if (days.length === 0) return NextResponse.json({ error: "No forecast" }, { status: 502 });
    return NextResponse.json({ status: "ok", place: place.name, countryCode: place.countryCode, days, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (e) {
    console.error("[trip-weather]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Weather unavailable" }, { status: 502 });
  }
}
