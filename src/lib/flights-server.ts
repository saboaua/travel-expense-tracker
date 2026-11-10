import { fromAviationstack, parseFlightNumber, type FlightFields } from "@/lib/flights";

/**
 * aviationstack (https://aviationstack.com): the flight by its number. Set AVIATIONSTACK_API_KEY.
 * The free plan covers live flights only (no future or past dates), so a flight far ahead is "not found" there and the
 * person enters it by hand; paid plans accept a date and find flights ahead of time.
 */
export function flightLookupConfigured(): boolean {
  return Boolean(process.env.AVIATIONSTACK_API_KEY);
}

export type LookupResult =
  | { ok: true; flight: FlightFields }
  | { ok: false; reason: "not_configured" | "bad_number" | "not_found" | "upstream"; upstream?: number };

async function ask(key: string, compact: string, date: string | null): Promise<{ status: number; json: unknown } | null> {
  const q = new URLSearchParams({ access_key: key, flight_iata: compact, limit: "10" });
  if (date) q.set("flight_date", date);
  try {
    const res = await fetch(`https://api.aviationstack.com/v1/flights?${q}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return null;
  }
}

const errorCode = (json: unknown): string => {
  const e = (json as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  return e ? String(e.code ?? e.type ?? "error") : "";
};

export async function lookupFlight(numberInput: string, date: string): Promise<LookupResult> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const num = parseFlightNumber(numberInput);
  if (!num) return { ok: false, reason: "bad_number" };
  let r = await ask(key, num.compact, date);
  // The free plan refuses the date filter: ask for the live flight and keep it only when it is the day wanted
  if (r && errorCode(r.json) === "function_access_restricted") r = await ask(key, num.compact, null);
  if (!r) return { ok: false, reason: "upstream" };
  const code = errorCode(r.json);
  if (code) return { ok: false, reason: "upstream", upstream: r.status };
  if (r.status === 404) return { ok: false, reason: "not_found" };
  if (r.status < 200 || r.status >= 300) return { ok: false, reason: "upstream", upstream: r.status };
  const flight = fromAviationstack(r.json, date);
  return flight ? { ok: true, flight } : { ok: false, reason: "not_found" };
}
