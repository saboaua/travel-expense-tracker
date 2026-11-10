import { fromAeroDataBox, parseFlightNumber, type FlightFields } from "@/lib/flights";

/**
 * AeroDataBox (through RapidAPI): the flight leaving on a date by its number.
 * Set AERODATABOX_API_KEY (the RapidAPI key). AERODATABOX_HOST is optional (default aerodatabox.p.rapidapi.com).
 */
export function flightLookupConfigured(): boolean {
  return Boolean(process.env.AERODATABOX_API_KEY);
}

export type LookupResult =
  | { ok: true; flight: FlightFields }
  | { ok: false; reason: "not_configured" | "bad_number" | "not_found" | "upstream"; upstream?: number };

export async function lookupFlight(numberInput: string, date: string): Promise<LookupResult> {
  const key = process.env.AERODATABOX_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const num = parseFlightNumber(numberInput);
  if (!num) return { ok: false, reason: "bad_number" };
  const host = process.env.AERODATABOX_HOST || "aerodatabox.p.rapidapi.com";
  const url = `https://${host}/flights/number/${encodeURIComponent(num.compact)}/${encodeURIComponent(date)}?withAircraftImage=false&withLocation=false`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": host, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "upstream" };
  }
  if (res.status === 204 || res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) return { ok: false, reason: "upstream", upstream: res.status };
  const json = await res.json().catch(() => null);
  const flight = fromAeroDataBox(json, date);
  return flight ? { ok: true, flight } : { ok: false, reason: "not_found" };
}
