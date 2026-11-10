import {
  parseFlightNumber, parseStamp, fromAeroDataBox, statusFromService, statusView, clock, delayMinutes, durationMinutes, durationText,
  arrivalDayOffset, zoneNote, manualFlight, sanitizeFlightScan, maskPnr, needsRefresh, changeKey, nextFlight, sortFlights, flightSummary, type TripFlight,
} from "../src/lib/flights";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// flight numbers
eq("number: spaced", parseFlightNumber("cm 312")?.display, "CM 312");
eq("number: dashed", parseFlightNumber("CM-312")?.compact, "CM312");
eq("number: leading zeros", parseFlightNumber("KL0729")?.display, "KL 729");
eq("number: digit in code", parseFlightNumber("U2 1234")?.display, "U2 1234");
eq("number: icao", parseFlightNumber("COA312")?.display, "COA 312");
eq("number: junk", parseFlightNumber("hello"), null);
eq("number: empty", parseFlightNumber(""), null);

// stamps
eq("stamp: with offset", parseStamp("2026-11-17 09:45-04:00"), { local: "2026-11-17T09:45", offset: -240 });
eq("stamp: utc", parseStamp("2026-11-17T13:45Z"), { local: "2026-11-17T13:45", offset: 0 });
eq("stamp: positive", parseStamp("2026-11-17 18:05+05:30"), { local: "2026-11-17T18:05", offset: 330 });
eq("stamp: none", parseStamp("nope"), null);

// AeroDataBox answer
const adb = [{
  number: "CM 312", status: "Expected",
  airline: { name: "Copa Airlines", iata: "CM" }, aircraft: { model: "Boeing 737 MAX 9" },
  departure: { airport: { iata: "AUA", municipalityName: "Oranjestad", shortName: "Queen Beatrix" }, scheduledTime: { utc: "2026-11-17 13:45Z", local: "2026-11-17 09:45-04:00" }, terminal: "1", gate: "3" },
  arrival: { airport: { iata: "PTY", municipalityName: "Panama City", shortName: "Tocumen" }, scheduledTime: { utc: "2026-11-17 15:40Z", local: "2026-11-17 10:40-05:00" }, terminal: "2", gate: "204" },
}];
const f = fromAeroDataBox(adb, "2026-11-17")!;
eq("adb: number", f.flight_number, "CM 312");
eq("adb: airline", f.airline, "Copa Airlines");
eq("adb: route", [f.dep_iata, f.arr_iata, f.dep_city, f.arr_city], ["AUA", "PTY", "Oranjestad", "Panama City"]);
eq("adb: times", [f.dep_local, f.arr_local], ["2026-11-17T09:45", "2026-11-17T10:40"]);
eq("adb: offsets", [f.dep_offset, f.arr_offset], [-240, -300]);
eq("adb: gate and terminal", [f.arr_terminal, f.arr_gate, f.dep_terminal], ["2", "204", "1"]);
eq("adb: on time", f.status, "scheduled");
eq("adb: nothing", fromAeroDataBox([], "2026-11-17"), null);
eq("adb: no times", fromAeroDataBox([{ number: "CM 312" }], "2026-11-17"), null);
// a delayed flight
const late = fromAeroDataBox([{ ...adb[0], departure: { ...adb[0].departure, revisedTime: { local: "2026-11-17 10:10-04:00" } } }], "2026-11-17")!;
eq("adb: delay shows as delayed", late.status, "delayed");
eq("adb: revised departure", late.dep_est_local, "2026-11-17T10:10");
// the right day among several
const two = fromAeroDataBox([{ ...adb[0], departure: { ...adb[0].departure, scheduledTime: { local: "2026-11-16 09:45-04:00" } } }, adb[0]], "2026-11-17")!;
eq("adb: picks the requested day", two.dep_local, "2026-11-17T09:45");

eq("status words", ["Canceled", "Arrived", "EnRoute", "Boarding", "Unknown"].map((s) => statusFromService(s, 0)), ["cancelled", "landed", "departed", "boarding", "unknown"]);

// showing it
const fl = (o: Partial<TripFlight> = {}): TripFlight => ({ ...f, id: "1", trip_id: "t", leg: "outbound", pnr: "WK89L2", seat: "04A", cabin: "Business", source: "auto", alerts: true, last_synced_at: null, ...o });
eq("clock: morning", clock("2026-11-17T09:45"), { time: "09:45", period: "AM" });
eq("clock: afternoon", clock("2026-11-17T15:05"), { time: "03:05", period: "PM" });
eq("clock: midnight", clock("2026-11-17T00:10"), { time: "12:10", period: "AM" });
eq("clock: noon", clock("2026-11-17T12:00"), { time: "12:00", period: "PM" });
eq("clock: none", clock(null), null);
eq("duration: across zones", durationMinutes(fl()), 115);
eq("duration text", durationText(115), "1h 55m");
eq("duration text: whole hours", durationText(120), "2h");
eq("duration: unknown offset", durationMinutes(fl({ dep_offset: null })), null);
eq("delay: none", delayMinutes(fl()), 0);
eq("delay: 25", delayMinutes(fl({ dep_est_local: "2026-11-17T10:10" })), 25);
eq("day offset: same day", arrivalDayOffset(fl()), 0);
eq("day offset: overnight", arrivalDayOffset(fl({ arr_local: "2026-11-18T06:00" })), 1);
eq("zone note: behind", zoneNote(fl()), "Local times at each airport. Panama City is 1 hour behind Oranjestad.");
eq("zone note: unknown", zoneNote(fl({ dep_offset: null })), "Local times at each airport.");
eq("status: on time", statusView(fl()), { label: "On time", tone: "ok" });
eq("status: manual is just scheduled", statusView(fl({ source: "manual" })), { label: "Scheduled", tone: "muted" });
eq("status: delayed", statusView(fl({ status: "delayed", dep_est_local: "2026-11-17T10:10" })), { label: "Delayed 25 min", tone: "warn" });
eq("status: cancelled", statusView(fl({ status: "cancelled" })).tone, "bad");
eq("pnr is masked", maskPnr("WK89L2"), "••••L2");
eq("pnr empty", maskPnr(null), "");
eq("summary", flightSummary(fl()), "CM 312 · AUA to PTY · 09:45 AM");

// manual entry
const ok = manualFlight({ flight_number: "cm312", flight_date: "2026-11-17", dep_iata: "aua", arr_iata: "pty", dep_time: "09:45", arr_time: "10:40" });
eq("manual: ok", ok.ok, true);
if (ok.ok) eq("manual: fields", [ok.fields.flight_number, ok.fields.dep_iata, ok.fields.dep_local, ok.fields.arr_local, ok.fields.dep_offset, ok.fields.status], ["CM 312", "AUA", "2026-11-17T09:45", "2026-11-17T10:40", null, "scheduled"]);
eq("manual: bad number", manualFlight({ flight_number: "x", flight_date: "2026-11-17", dep_iata: "AUA", arr_iata: "PTY", dep_time: "09:45", arr_time: "10:40" }).ok, false);
eq("manual: same airport", manualFlight({ flight_number: "CM312", flight_date: "2026-11-17", dep_iata: "AUA", arr_iata: "AUA", dep_time: "09:45", arr_time: "10:40" }).ok, false);
eq("manual: bad time", manualFlight({ flight_number: "CM312", flight_date: "2026-11-17", dep_iata: "AUA", arr_iata: "PTY", dep_time: "25:00", arr_time: "10:40" }).ok, false);
const night = manualFlight({ flight_number: "CM312", flight_date: "2026-11-17", dep_iata: "AUA", arr_iata: "MAD", dep_time: "22:00", arr_time: "12:30", arr_date: "2026-11-18" });
eq("manual: arrives next day", night.ok && night.fields.arr_local, "2026-11-18T12:30");

// scanned ticket
const scan = sanitizeFlightScan({ flight_number: "KL 0729", flight_date: "2026-11-17", dep_iata: "ams", arr_iata: "AUA", pnr: "wk89l2", seat: "04a", cabin: "business", passenger: "DOE/JOHN", ticket: "074-1234567890" }, "2026-11-10");
eq("scan: cleaned", scan, { flight_number: "KL 729", flight_date: "2026-11-17", dep_iata: "AMS", arr_iata: "AUA", pnr: "WK89L2", seat: "4A", cabin: "Business", passenger: null });
eq("scan: junk is dropped", sanitizeFlightScan({ flight_number: "??", flight_date: "17/11", pnr: "x", seat: "zz" }, "2026-11-10"), { flight_number: null, flight_date: null, dep_iata: null, arr_iata: null, pnr: null, seat: null, cabin: null, passenger: null });

// keeping it fresh
const NOW = Date.parse("2026-11-17T08:00:00Z") + 4 * 3600_000; // 08:00 in Aruba on the flight day
eq("refresh: near and never checked", needsRefresh(fl(), NOW), true);
eq("refresh: checked 2 minutes ago", needsRefresh(fl({ last_synced_at: new Date(NOW - 120_000).toISOString() }), NOW), false);
eq("refresh: checked an hour ago", needsRefresh(fl({ last_synced_at: new Date(NOW - 3600_000).toISOString() }), NOW), true);
eq("refresh: manual never", needsRefresh(fl({ source: "manual" }), NOW), false);
eq("refresh: landed never", needsRefresh(fl({ status: "landed" }), NOW), false);
eq("refresh: a week away", needsRefresh(fl(), NOW - 7 * 86400_000), false);
eq("refresh: long gone", needsRefresh(fl(), NOW + 3 * 86400_000), false);
eq("alert key changes with the gate", changeKey(fl()) === changeKey(fl({ dep_gate: "9" })), false);
eq("alert key steady", changeKey(fl()) === changeKey(fl()), true);

// order and the next flight
const back = fl({ id: "2", leg: "return", flight_date: "2026-11-20", dep_local: "2026-11-20T14:00", dep_offset: -300 });
eq("sorted outbound first", sortFlights([back, fl()]).map((x) => x.id), ["1", "2"]);
eq("next: soonest not landed", nextFlight([back, fl()], NOW)?.id, "1");
eq("next: skips a landed one", nextFlight([fl({ status: "landed" }), back], NOW)?.id, "2");
eq("next: none", nextFlight([], NOW), null);

console.log(fail ? `${fail} FAILED` : "flights: all checks passed");
process.exit(fail ? 1 : 0);
