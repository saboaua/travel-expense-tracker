import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isIsoDay, parseFlightNumber, tooEarlyToLook } from "@/lib/flights";
import { lookupFlight } from "@/lib/flights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Finds a flight by number and date. The answer never stores anything; the app saves it when the person confirms. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const number = url.searchParams.get("number") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!parseFlightNumber(number)) return NextResponse.json({ error: "Enter the flight number, like CM 312.", reason: "bad_number" }, { status: 400 });
  if (!isIsoDay(date)) return NextResponse.json({ error: "Choose the flight date.", reason: "bad_date" }, { status: 400 });
  // Further ahead than the service can see: no call (it would only use up the allowance); the person enters it by hand and it is filled in on the day
  if (tooEarlyToLook(date, Date.now())) return NextResponse.json({ error: "too_early", reason: "too_early" }, { status: 404 });
  if (!(await rateLimit(`flight-lookup:${user.id}`, 40, 3600))) return NextResponse.json({ error: "Too many lookups this hour.", reason: "limit" }, { status: 429 });

  const result = await lookupFlight(number, date);
  if (result.ok) return NextResponse.json({ flight: result.flight });
  const status = result.reason === "not_configured" ? 503 : result.reason === "not_found" ? 404 : 502;
  return NextResponse.json({ error: result.reason, reason: result.reason, upstream: result.upstream ?? null, code: result.code ?? null }, { status });
}
