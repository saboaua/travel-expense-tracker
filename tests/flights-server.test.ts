import { lookupFlight } from "../src/lib/flights-server";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log("PASS", name);
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

const entry = (iata: string, day: string, extra: object = {}) => ({
  flight_date: day, flight_status: "scheduled",
  departure: { airport: "Queen Beatrix", timezone: "America/Aruba", iata: "AUA", scheduled: `${day}T09:45:00+00:00`, estimated: `${day}T09:45:00+00:00`, delay: null },
  arrival: { airport: "Tocumen", timezone: "America/Panama", iata: "PTY", scheduled: `${day}T10:40:00+00:00`, estimated: `${day}T10:40:00+00:00` },
  airline: { name: "Copa Airlines", iata: "CM" }, flight: { number: iata.slice(2), iata, codeshared: null }, ...extra,
});

type Call = { url: URL };
const calls: Call[] = [];
const serve = (handler: (u: URL) => unknown) => {
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    calls.push({ url });
    const body = handler(url);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
};

process.env.AVIATIONSTACK_API_KEY = "test-key";

async function main() {
  // Paid plan: the date filter works
  calls.length = 0;
  serve((u) => ({ data: u.searchParams.get("flight_date") ? [entry("CM312", "2026-11-17")] : [] }));
  let r = await lookupFlight("cm 312", "2026-11-17");
  eq("paid plan: found with the date", r.ok && r.flight.flight_number, "CM 312");
  eq("paid plan: one call, with the key, number and date", [calls.length, calls[0].url.searchParams.get("flight_iata"), calls[0].url.searchParams.get("flight_date"), calls[0].url.searchParams.get("access_key")], [1, "CM312", "2026-11-17", "test-key"]);

  // Free plan refuses the date filter with an error: fall back to the live flight
  calls.length = 0;
  serve((u) => (u.searchParams.get("flight_date") ? { error: { code: "function_access_restricted", message: "no" } } : { data: [entry("CM312", "2026-11-10")] }));
  r = await lookupFlight("CM312", "2026-11-10");
  eq("free plan (error): live flight used when it is the day asked", [r.ok, calls.length], [true, 2]);

  // Free plan answers the date filter with an empty list: also fall back
  calls.length = 0;
  serve((u) => ({ data: u.searchParams.get("flight_date") ? [] : [entry("CM312", "2026-11-10")] }));
  r = await lookupFlight("CM312", "2026-11-10");
  eq("free plan (empty): live flight used, and the refused date filter is not asked again", [r.ok, calls.length], [true, 1]);

  // Live flight is another day: not found
  serve((u) => ({ data: u.searchParams.get("flight_date") ? [] : [entry("CM312", "2026-11-10")] }));
  r = await lookupFlight("CM312", "2026-12-01");
  eq("a day with no flight is not found", r.ok === false && r.reason, "not_found");

  // Codeshare listed first: the operating flight is the one used
  serve(() => ({ data: [entry("AV9999", "2026-11-17", { flight: { number: "9999", iata: "AV9999", codeshared: { airline_iata: "cm" } } }), entry("CM312", "2026-11-17")] }));
  r = await lookupFlight("CM312", "2026-11-17");
  eq("codeshare duplicates are skipped", r.ok && r.flight.flight_number, "CM 312");


  // A real answer from the free plan (CM767, landed 19 minutes late; the other entry is its Turkish Airlines codeshare)
  const side = (iata: string, tz: string, name: string, sched: string, est: string, actual: string, delay: number, extra: object) => ({ airport: name, timezone: tz, iata, terminal: null, gate: "2", delay, scheduled: sched, estimated: est, actual, ...extra });
  const dep = side("AUA", "America/Aruba", "Reina Beatrix", "2026-11-10T15:46:00+00:00", "2026-11-10T15:46:00+00:00", "2026-11-10T16:05:00+00:00", 19, {});
  const arr = side("PTY", "America/Panama", "Tocumen International", "2026-11-10T16:54:00+00:00", "2026-11-10T16:50:00+00:00", "2026-11-10T17:04:00+00:00", 10, { terminal: "2", gate: "208" });
  const copa = { flight_date: "2026-11-10", flight_status: "landed", departure: dep, arrival: arr, airline: { name: "Copa Airlines", iata: "CM" }, flight: { number: "767", iata: "CM767", codeshared: null }, aircraft: { iata: "B38M" } };
  const tk = { ...copa, airline: { name: "Turkish Airlines", iata: "TK" }, flight: { number: "9156", iata: "TK9156", codeshared: { flight_iata: "cm767" } } };
  serve(() => ({ data: [tk, copa] }));
  r = await lookupFlight("CM 767", "2026-11-10");
  if (r.ok) {
    eq("real: operating flight, not the codeshare", [r.flight.flight_number, r.flight.airline], ["CM 767", "Copa Airlines"]);
    eq("real: scheduled local times", [r.flight.dep_local, r.flight.arr_local], ["2026-11-10T15:46", "2026-11-10T16:54"]);
    eq("real: late departure shows the actual time", [r.flight.dep_est_local, r.flight.arr_est_local], ["2026-11-10T16:05", "2026-11-10T17:04"]);
    eq("real: landed, offsets, gate", [r.flight.status, r.flight.dep_offset, r.flight.arr_offset, r.flight.arr_gate, r.flight.arr_terminal], ["landed", -240, -300, "208", "2"]);
  } else eq("real: found", r, "a flight");
  // asked for the codeshare number: that entry is used
  r = await lookupFlight("TK 9156", "2026-11-10");
  eq("real: the partner number finds its own entry", r.ok && r.flight.flight_number, "TK 9156");

  // Real errors are passed on, not hidden as "not found"
  serve(() => ({ error: { code: "invalid_access_key", message: "bad" } }));
  r = await lookupFlight("CM312", "2026-11-17");
  eq("bad key is reported", r.ok === false && [r.reason, r.code], ["upstream", "invalid_access_key"]);
  serve(() => ({ error: { code: "usage_limit_reached" } }));
  r = await lookupFlight("CM312", "2026-11-17");
  eq("limit is reported", r.ok === false && [r.reason, r.code], ["upstream", "usage_limit_reached"]);

  // Nothing set up, bad number
  delete process.env.AVIATIONSTACK_API_KEY;
  r = await lookupFlight("CM312", "2026-11-17");
  eq("no key", r.ok === false && r.reason, "not_configured");
  process.env.AVIATIONSTACK_API_KEY = "test-key";
  r = await lookupFlight("??", "2026-11-17");
  eq("bad number", r.ok === false && r.reason, "bad_number");

  console.log(fail ? `${fail} FAILED` : "flights-server: all checks passed");
  process.exit(fail ? 1 : 0);
}
main();
