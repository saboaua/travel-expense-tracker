import {
  parseFlightNumber, parseStamp, fromAviationstack, zoneOffsetMinutes, statusFromService, statusView, clock, delayMinutes, durationMinutes, durationText,
  arrivalDayOffset, zoneNote, manualFlight, sanitizeFlightScan, maskPnr, needsRefresh, lookupPatch, tooEarlyToLook, flightLine, changeKey, nextFlight, sortFlights, flightSummary, type TripFlight,
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

// aviationstack answer (stamps end in +00:00 but the clock is local)
const adb = { data: [{
  flight_date: "2026-11-17", flight_status: "scheduled",
  departure: { airport: "Queen Beatrix", timezone: "America/Aruba", iata: "AUA", terminal: "1", gate: "3", delay: null, scheduled: "2026-11-17T09:45:00+00:00", estimated: "2026-11-17T09:45:00+00:00", actual: null },
  arrival: { airport: "Tocumen", timezone: "America/Panama", iata: "PTY", terminal: "2", gate: "204", delay: null, scheduled: "2026-11-17T10:40:00+00:00", estimated: "2026-11-17T10:40:00+00:00", actual: null },
  airline: { name: "Copa Airlines", iata: "CM" }, flight: { number: "312", iata: "CM312" }, aircraft: { iata: "B739" },
}] };
const f = fromAviationstack(adb, "2026-11-17")!;
eq("avs: number", f.flight_number, "CM 312");
eq("avs: airline", f.airline, "Copa Airlines");
eq("avs: route", [f.dep_iata, f.arr_iata], ["AUA", "PTY"]);
eq("avs: times read as local", [f.dep_local, f.arr_local], ["2026-11-17T09:45", "2026-11-17T10:40"]);
eq("avs: offsets from zone names", [f.dep_offset, f.arr_offset], [-240, -300]);
eq("avs: gate and terminal", [f.arr_terminal, f.arr_gate, f.dep_terminal], ["2", "204", "1"]);
eq("avs: on time", [f.status, f.dep_est_local], ["scheduled", null]);
eq("avs: nothing", fromAviationstack({ data: [] }, "2026-11-17"), null);
eq("avs: garbage", fromAviationstack(null, "2026-11-17"), null);
eq("avs: no times", fromAviationstack({ data: [{ flight: { iata: "CM312" } }] }, "2026-11-17"), null);
eq("avs: other day is not it", fromAviationstack(adb, "2026-11-18"), null);
eq("avs: no date wanted takes the first", fromAviationstack(adb, null)!.flight_number, "CM 312");
const dep = (o: object) => ({ data: [{ ...adb.data[0], departure: { ...adb.data[0].departure, ...o } }] });
const late = fromAviationstack(dep({ delay: 25, estimated: "2026-11-17T10:10:00+00:00" }), "2026-11-17")!;
eq("avs: delay shows as delayed", [late.status, late.dep_est_local], ["delayed", "2026-11-17T10:10"]);
eq("avs: active is in the air", fromAviationstack({ data: [{ ...adb.data[0], flight_status: "active" }] }, "2026-11-17")!.status, "departed");
eq("avs: landed", fromAviationstack({ data: [{ ...adb.data[0], flight_status: "landed" }] }, "2026-11-17")!.status, "landed");
eq("zone offset: winter and summer", [zoneOffsetMinutes("America/New_York", "2026-01-15T10:00"), zoneOffsetMinutes("America/New_York", "2026-07-15T10:00"), zoneOffsetMinutes("Asia/Kolkata", "2026-07-15T10:00"), zoneOffsetMinutes("Nowhere/Land", "2026-07-15T10:00"), zoneOffsetMinutes(null, "2026-07-15T10:00")], [-300, -240, 330, null, null]);

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
eq("zone note: behind", zoneNote(fl()), "Local times at each airport. PTY is 1 hour behind AUA.");
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
eq("refresh: by hand, near and never tried", needsRefresh(fl({ source: "manual" }), NOW), true);
eq("refresh: by hand, tried an hour ago waits for 3 hours", needsRefresh(fl({ source: "manual", last_synced_at: new Date(NOW - 3600_000).toISOString() }), NOW), false);
eq("refresh: by hand, tried 4 hours ago", needsRefresh(fl({ source: "manual", last_synced_at: new Date(NOW - 4 * 3600_000).toISOString() }), NOW), true);
eq("refresh: by hand, two days away is too early", needsRefresh(fl({ source: "manual" }), NOW - 2 * 86400_000), false);
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

// look-ahead: a flight further ahead than the service sees is entered by hand
const noon = Date.parse("2026-11-10T12:00:00Z");
eq("lookahead: today and past days can be looked up", [tooEarlyToLook("2026-11-10", noon), tooEarlyToLook("2026-11-01", noon)], [false, false]);
eq("lookahead: tomorrow is too early by default", tooEarlyToLook("2026-11-11", noon), true);
eq("lookahead: a paid plan that sees a week ahead", [tooEarlyToLook("2026-11-17", noon, 7), tooEarlyToLook("2026-11-18", noon, 7)], [false, true]);
eq("lookahead: not a date is not 'too early'", tooEarlyToLook("soon", noon), false);

// what is saved after asking the service
const found = { ...f, airline: "Copa Airlines", dep_gate: "7" };
const at = "2026-11-10T12:00:00.000Z";
eq("patch: a live flight takes the answer", [lookupPatch(fl(), found, at).dep_gate, lookupPatch(fl(), found, at).source], ["7", undefined]);
eq("patch: nothing found only records the try", lookupPatch(fl({ source: "manual" }), null, at), { last_synced_at: at });
eq("patch: a flight typed by hand turns live when the route matches", [lookupPatch(fl({ source: "manual" }), found, at).source, lookupPatch(fl({ source: "manual" }), found, at).dep_gate], ["auto", "7"]);
eq("patch: ...but keeps the person's flight number", lookupPatch(fl({ source: "manual", flight_number: "CM 312" }), { ...found, flight_number: "CM 999" }, at).flight_number, "CM 312");
eq("patch: a different route is not taken over", lookupPatch(fl({ source: "manual", dep_iata: "AMS" }), found, at), { last_synced_at: at });
eq("patch: a missing airport does not block it", lookupPatch(fl({ source: "manual", dep_iata: null }), found, at).source, "auto");
eq("patch: seat, cabin and code are never in the patch", ["pnr", "seat", "cabin"].filter((k) => k in lookupPatch(fl({ source: "manual" }), { ...found, pnr: "X", seat: "1A", cabin: "Y" } as typeof found, at)), []);

// the line on trip cards and the dashboard
const line = flightLine([fl(), fl({ id: "2", leg: "return", flight_number: "CM 313", dep_local: "2026-11-24T14:00", flight_date: "2026-11-24" })], Date.parse("2026-11-10T12:00:00Z"));
eq("line: next flight, route, time and how many more", [line?.number, line?.from, line?.to, line?.time, line?.more], ["CM 312", "AUA", "PTY", "09:45 AM", 1]);
eq("line: no flights, no line", flightLine([], NOW), null);

console.log(fail ? `${fail} FAILED` : "flights: all checks passed");
process.exit(fail ? 1 : 0);
