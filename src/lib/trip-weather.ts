/**
 * Weather for the days of a trip: Open-Meteo search (place) + Open-Meteo forecast (daily). No key needed.
 * Only the place name and the dates are sent out, never amounts or trip details.
 */
import { addDaysISO } from "@/lib/utils";

export type TripDay = { date: string; code: number; hi: number; lo: number; rain: number | null };
export type TripWeather = { place: string; countryCode: string | null; days: TripDay[]; updatedAt: string };

/** Open-Meteo forecasts reach 16 days (today and the 15 after). */
export const FORECAST_REACH = 15;
export const MAX_TRIP_DAYS = 7;

export type Window =
  | { status: "past" }
  | { status: "early"; opensOn: string }
  | { status: "ok"; start: string; end: string };

/** Which days of the trip to show: the trip's own days from today on, at most 7, and only those a forecast can reach. */
export function forecastWindow(start: string, end: string | null | undefined, today: string): Window {
  const last = end && end >= start ? end : start;
  if (last < today) return { status: "past" };
  const first = start > today ? start : today;
  const reach = addDaysISO(today, FORECAST_REACH);
  if (first > reach) return { status: "early", opensOn: addDaysISO(first, -FORECAST_REACH) };
  let stop = last;
  const cap = addDaysISO(first, MAX_TRIP_DAYS - 1);
  if (stop > cap) stop = cap;
  if (stop > reach) stop = reach;
  return { status: "ok", start: first, end: stop };
}

export type Place = { name: string; countryCode: string | null; lat: number; lon: number };
type Fetcher = typeof fetch;
const HEADERS = { "User-Agent": "TravelExpenseTracker/1.0 (https://github.com/saboaua/travel-expense-tracker)" };

async function getJson<T>(url: string, fetcher: Fetcher, revalidate: number): Promise<T> {
  const res = await fetcher(url, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(6000) } as RequestInit);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** "Panama City, Panama" is searched as typed, then by its first part, then its last part. */
export function placeQueries(destination: string): string[] {
  const full = destination.replace(/\s+/g, " ").trim();
  if (!full) return [];
  const parts = full.split(/[,–—;|/]/).map((p) => p.trim()).filter(Boolean);
  const out = [full, parts[0], parts[parts.length - 1]].filter((q): q is string => !!q && q.length >= 2);
  return [...new Set(out)];
}

export async function findPlace(destination: string, fetcher: Fetcher = fetch): Promise<Place | null> {
  for (const q of placeQueries(destination)) {
    try {
      const d = await getJson<{ results?: { name: string; country_code?: string; latitude: number; longitude: number }[] }>(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
        fetcher,
        86400
      );
      const r = d.results?.[0];
      if (r && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) {
        return { name: r.name, countryCode: r.country_code ?? null, lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100 };
      }
    } catch {
      // try the next spelling
    }
  }
  return null;
}

export async function fetchTripDays(place: Place, start: string, end: string, fetcher: Fetcher = fetch): Promise<TripDay[]> {
  const d = await getJson<{
    daily?: { time?: string[]; weather_code?: (number | null)[]; temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; precipitation_probability_max?: (number | null)[] };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=${start}&end_date=${end}&timezone=auto`,
    fetcher,
    1800
  );
  const t = d.daily?.time ?? [];
  const days: TripDay[] = [];
  t.forEach((date, i) => {
    const hi = d.daily?.temperature_2m_max?.[i];
    const lo = d.daily?.temperature_2m_min?.[i];
    if (typeof hi !== "number" || typeof lo !== "number") return;
    const code = d.daily?.weather_code?.[i];
    const rain = d.daily?.precipitation_probability_max?.[i];
    days.push({ date, code: typeof code === "number" ? code : 3, hi, lo, rain: typeof rain === "number" ? Math.round(rain) : null });
  });
  return days;
}

export const isRainy = (d: TripDay) => (d.rain ?? 0) >= 50;

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** One plain sentence for the top of the card, or null when there is nothing worth saying. */
export function weatherTip(days: TripDay[], today?: string): string | null {
  if (days.length === 0) return null;
  const rainy = days.filter(isRainy);
  if (rainy.length === 0) return null;
  if (days.length === 1) return "Rain likely";
  if (rainy.length === 1) return `Rain likely ${rainy[0].date === today ? "today" : `on ${weekday(rainy[0].date)}`}`;
  if (rainy.length === days.length) return `Pack a rain jacket: rain likely on all ${days.length} days`;
  return `Pack a rain jacket: rain likely on ${rainy.length} of ${days.length} days`;
}
