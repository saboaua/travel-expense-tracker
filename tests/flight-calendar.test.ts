import { buildFlightIcs, flightTimes, flightTitle, googleFlightUrl, flightIcsName, type CalendarFlight } from "../src/lib/flight-calendar";
import { cleanSharedFlights } from "../src/lib/sharing";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log("PASS", name);
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

const f: CalendarFlight = {
  id: "f1", flight_number: "CM 312", airline: "Copa Airlines",
  dep_iata: "AUA", dep_name: "Queen Beatrix", dep_city: null, dep_local: "2026-11-17T09:45", dep_est_local: null, dep_offset: -240, dep_terminal: "1", dep_gate: "3",
  arr_iata: "PTY", arr_name: "Tocumen", arr_city: null, arr_local: "2026-11-17T10:40", arr_est_local: null, arr_offset: -300, arr_terminal: "2", arr_gate: null,
};
const now = new Date("2026-11-10T12:00:00Z");

eq("title", flightTitle(f), "CM 312 AUA to PTY");
eq("fixed in time: UTC from each airport's offset", flightTimes(f), { start: "20261117T134500Z", end: "20261117T154000Z", fixed: true });
// a late flight uses the revised times
eq("revised times", flightTimes({ ...f, dep_est_local: "2026-11-17T10:10", arr_est_local: "2026-11-17T11:05" }), { start: "20261117T141000Z", end: "20261117T160500Z", fixed: true });
// by hand: no offsets, so floating local time
eq("floating when offsets are unknown", flightTimes({ ...f, dep_offset: null, arr_offset: null }), { start: "20261117T094500", end: "20261117T104000", fixed: false });
eq("floating when only one offset is known", flightTimes({ ...f, arr_offset: null })?.fixed, false);
eq("no departure time, no event", flightTimes({ ...f, dep_local: null }), null);
eq("end before start becomes one hour", flightTimes({ ...f, arr_local: "2026-11-17T08:00", arr_offset: -240 })?.end, "20261117T144500Z");
eq("no arrival: one hour", flightTimes({ ...f, arr_local: null, arr_offset: null })?.end, "20261117T144500Z");

const ics = buildFlightIcs(f, { reminder: "3h", link: "https://app.test/trips/t1", now })!;
const has = (s: string) => ics.replace(/\r\n /g, "").includes(s);
eq("ics: calendar and event", [has("BEGIN:VCALENDAR"), has("BEGIN:VEVENT"), has("END:VCALENDAR")], [true, true, true]);
eq("ics: stable id, so a repeat replaces it", has("UID:flight-f1@lifolio"), true);
eq("ics: times", [has("DTSTART:20261117T134500Z"), has("DTEND:20261117T154000Z")], [true, true]);
eq("ics: title and place", [has("SUMMARY:CM 312 AUA to PTY"), has("LOCATION:Queen Beatrix (AUA) Terminal 1")], [true, true]);
eq("ics: details mention terminal, gate and that times can change", [has("Terminal 1"), has("Gate 3"), has("can change")], [true, true, true]);
eq("ics: reminder", has("TRIGGER:-PT3H"), true);
eq("ics: lines are CRLF", ics.endsWith("\r\n") && !/[^\r]\n/.test(ics), true);
eq("ics: no reminder", buildFlightIcs(f, { reminder: "none", now })!.includes("VALARM"), false);
eq("ics: a day before", buildFlightIcs(f, { reminder: "1d", now })!.includes("TRIGGER:-P1D"), true);
eq("ics: never holds booking details", /WK89L2|seat|Seat|cabin/.test(ics), false);
eq("ics: nothing without a departure", buildFlightIcs({ ...f, dep_local: null }, { reminder: "none" }), null);
eq("ics: later copies get a higher sequence", Number(buildFlightIcs(f, { reminder: "none", now: new Date("2026-11-11T12:00:00Z") })!.match(/SEQUENCE:(\d+)/)![1]) > Number(ics.match(/SEQUENCE:(\d+)/)![1]), true);

const g = new URL(googleFlightUrl(f, "https://app.test")!);
eq("google: filled in", [g.searchParams.get("text"), g.searchParams.get("dates")], ["CM 312 AUA to PTY", "20261117T134500Z/20261117T154000Z"]);
eq("file name", flightIcsName(f), "cm-312-aua-pty.ics");

// what a partner gets back is cleaned to the allowed fields
const raw = { share_id: "s", trip_id: "t", flight_id: "f1", leg: "outbound", flight_number: "CM 312", flight_date: "2026-11-17", dep_local: "2026-11-17T09:45:00", pnr: "WK89L2", seat: "04A", cabin: "Business", user_id: "u", alerts: true, status: "scheduled", source: "auto", shared_by: "Alice" };
const [clean] = cleanSharedFlights([raw, null, "x"]);
eq("shared flights: private fields are dropped", ["pnr", "seat", "cabin", "user_id", "alerts"].filter((k) => k in clean), []);
eq("shared flights: times are plain local clock text", [clean.dep_local, clean.flight_date, clean.dep_est_local], ["2026-11-17T09:45", "2026-11-17", null]);
eq("shared flights: junk gives nothing", cleanSharedFlights(null), []);

console.log(fail ? `${fail} FAILED` : "flight-calendar: all checks passed");
process.exit(fail ? 1 : 0);
