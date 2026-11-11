import { fromAviationstack, parseFlightNumber, type FlightFields } from "@/lib/flights";

/**
 * aviationstack (https://aviationstack.com): the flight by its number. Set AVIATIONSTACK_API_KEY.
 * The free plan covers live flights only (no future or past dates), so a flight far ahead is "not found" there and the
 * person enters it by hand; paid plans accept a date and find flights ahead of time.
 */
export function flightLookupConfigured(): boolean {
  return Boolean(process.env.AVIATIONSTACK_API_KEY);
}

/** Set once the plan has refused the date filter, so later lookups skip the call that would only use up the monthly allowance. */
let dateFilterRefused = false;

export type LookupResult =
  | { ok: true; flight: FlightFields }
  | { ok: false; reason: "not_configured" | "bad_number" | "not_found" | "upstream"; upstream?: number; code?: string };

type Answer = { status: number; json: unknown };

async function ask(key: string, compact: string, date: string | null): Promise<Answer | null> {
  const q = new URLSearchParams({ access_key: key, flight_iata: compact, limit: "100" });
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

/** aviationstack reports problems as { error: { code, message } }, sometimes with a 200 status. */
const errorCode = (json: unknown): string => {
  const e = (json as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  return e ? String(e.code ?? e.type ?? "error") : "";
};

export async function lookupFlight(numberInput: string, date: string): Promise<LookupResult> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const num = parseFlightNumber(numberInput);
  if (!num) return { ok: false, reason: "bad_number" };

  // With the date first (paid plans find flights ahead of time). The free plan either refuses the date filter or answers
  // with nothing for it, so when that gives no flight, ask for the live flight and keep it only if it is the day wanted.
  let r = dateFilterRefused ? null : await ask(key, num.compact, date);
  if (r && errorCode(r.json) === "function_access_restricted") dateFilterRefused = true;
  let flight = r && !errorCode(r.json) ? fromAviationstack(r.json, date, num.compact) : null;
  if (!flight && (!r || !errorCode(r.json) || errorCode(r.json) === "function_access_restricted")) {
    const live = await ask(key, num.compact, null);
    if (live) {
      r = live;
      flight = !errorCode(live.json) ? fromAviationstack(live.json, date, num.compact) : null;
    }
  }
  if (flight) return { ok: true, flight };
  if (!r) return { ok: false, reason: "upstream" };
  const code = errorCode(r.json);
  if (code) {
    console.warn(`[flights] aviationstack answered ${r.status} ${code} for ${num.compact} ${date}`);
    return { ok: false, reason: "upstream", upstream: r.status, code };
  }
  if (r.status < 200 || r.status >= 300) return { ok: false, reason: "upstream", upstream: r.status };
  return { ok: false, reason: "not_found" };
}
