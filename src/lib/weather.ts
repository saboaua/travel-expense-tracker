/**
 * Current weather for a place: Open-Meteo (forecast, no API key) + BigDataCloud (place name).
 * Both calls live in this one file so the provider can be swapped without touching the UI.
 */

export type WeatherNow = {
  city: string | null;
  countryCode: string | null;
  tempC: number;
  code: number; // WMO weather code
  isDay: boolean;
  rainChance: number | null; // % chance of rain today (max)
};

type Fetcher = typeof fetch;

const HEADERS = { "User-Agent": "TravelExpenseTracker/1.0 (https://github.com/saboaua/travel-expense-tracker)" };

async function getJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const res = await fetcher(url, {
    headers: HEADERS,
    next: { revalidate: 600 }, // cache 10 minutes per rounded location
    signal: AbortSignal.timeout(5000),
  } as RequestInit);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchPlaceName(lat: number, lon: number, fetcher: Fetcher = fetch) {
  try {
    const d = await getJson<{ city?: string; locality?: string; principalSubdivision?: string; countryCode?: string }>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      fetcher
    );
    return { city: d.city || d.locality || d.principalSubdivision || null, countryCode: d.countryCode || null };
  } catch {
    return { city: null, countryCode: null };
  }
}

export async function fetchWeather(
  lat: number,
  lon: number,
  hint: { city?: string | null; countryCode?: string | null } = {},
  fetcher: Fetcher = fetch
): Promise<WeatherNow> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,is_day&daily=precipitation_probability_max&forecast_days=1&timezone=auto`;

  const [forecast, place] = await Promise.all([
    getJson<{
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
      daily?: { precipitation_probability_max?: (number | null)[] };
    }>(forecastUrl, fetcher),
    hint.city ? Promise.resolve({ city: hint.city, countryCode: hint.countryCode ?? null }) : fetchPlaceName(lat, lon, fetcher),
  ]);

  const cur = forecast.current;
  if (!cur || typeof cur.temperature_2m !== "number") throw new Error("No current weather");

  const rain = forecast.daily?.precipitation_probability_max?.[0];
  return {
    city: place.city,
    countryCode: place.countryCode ?? hint.countryCode ?? null,
    tempC: cur.temperature_2m,
    code: typeof cur.weather_code === "number" ? cur.weather_code : 0,
    isDay: cur.is_day !== 0,
    rainChance: typeof rain === "number" ? Math.round(rain) : null,
  };
}

/** Countries that show temperatures in Fahrenheit. */
const FAHRENHEIT = new Set(["US", "BS", "BZ", "KY", "PW", "FM", "MH", "LR"]);
export const usesFahrenheit = (countryCode: string | null | undefined) => !!countryCode && FAHRENHEIT.has(countryCode.toUpperCase());

export function formatTemp(tempC: number, fahrenheit: boolean) {
  return fahrenheit ? `${Math.round((tempC * 9) / 5 + 32)}°F` : `${Math.round(tempC)}°C`;
}

export type SkyKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export function skyKind(code: number): { kind: SkyKind; label: string } {
  if (code === 0) return { kind: "clear", label: "Clear" };
  if (code === 1 || code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: "rain", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", label: "Snow" };
  if (code >= 95) return { kind: "storm", label: "Thunderstorm" };
  return { kind: "cloudy", label: "Cloudy" };
}

/** Parse and clamp coordinates from a query string; rounded to ~1 km for privacy and caching. */
export function parseCoords(lat: string | null, lon: string | null): { lat: number; lon: number } | null {
  if (lat == null || lon == null || lat === "" || lon === "") return null;
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: Math.round(la * 100) / 100, lon: Math.round(lo * 100) / 100 };
}
