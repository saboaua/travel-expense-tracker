// Run with: npx tsx tests/trip-calendar.test.ts
import {
  buildTripIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  guessTarget,
  icsFileName,
  icsPath,
  longDateRange,
  markState,
  nextDay,
} from "../src/lib/trip-calendar";
let failed = 0;
const eq = (a: unknown, b: unknown, m: string) => { const ok = a === b; console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${a} want ${b}`); if (!ok) failed++; };
const has = (s: string, part: string, m: string) => eq(s.includes(part), true, m);

const trip = {
  id: "3f1c2b8e-1111-4a2b-9c3d-000000000001",
  name: "Winlott Meeting 2026",
  destination: "Panama",
  start_date: "2026-11-17",
  end_date: "2026-11-20",
  notes: "Hotel: Central, room booked",
  updated_at: "2026-11-01T12:00:00Z",
};
const now = new Date("2026-11-08T15:00:00Z");

eq(nextDay("2026-11-20"), "2026-11-21", "next day");
eq(nextDay("2026-12-31"), "2027-01-01", "next day across years");
eq(nextDay("2028-02-28"), "2028-02-29", "next day leap year");

const ics = buildTripIcs(trip, { reminder: "1d", details: true, link: "https://app.example/trips/x", now });
has(ics, "DTSTART;VALUE=DATE:20261117", "all-day start");
has(ics, "DTEND;VALUE=DATE:20261121", "end is the morning after the last day");
has(ics, "SUMMARY:Winlott Meeting 2026", "title");
has(ics, "LOCATION:Panama", "location");
has(ics, `UID:trip-${trip.id}@lifolio`, "stable UID per trip");
has(ics, "TRIGGER:-PT15H", "1 day reminder at 9 AM the day before");
has(ics.replace(/\r\n /g, ""), "DESCRIPTION:Hotel: Central\\, room booked\\n\\nOpen in Lifolio: https://app.example/trips/x", "notes and link, escaped");
has(ics, "DTSTAMP:20261108T150000Z", "timestamp");
eq(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), true, "every line at most 75 bytes");
eq(ics.endsWith("END:VCALENDAR\r\n"), true, "CRLF line endings");

const plain = buildTripIcs({ ...trip, end_date: null, destination: null }, { reminder: "none", details: false, now });
has(plain, "DTEND;VALUE=DATE:20261118", "single-day trip");
eq(plain.includes("VALARM"), false, "no reminder");
eq(plain.includes("DESCRIPTION"), false, "no details when switched off");
eq(plain.includes("LOCATION"), false, "no location when unknown");
has(buildTripIcs(trip, { reminder: "1w", details: false, now }), "TRIGGER:-P6DT15H", "1 week reminder");
has(buildTripIcs({ ...trip, end_date: "2026-11-10" }, { reminder: "none", details: false, now }), "DTEND;VALUE=DATE:20261118", "end before start falls back to start");

const older = buildTripIcs({ ...trip, updated_at: "2026-10-01T00:00:00Z" }, { reminder: "none", details: false, now }).match(/SEQUENCE:(\d+)/)![1];
const newer = buildTripIcs(trip, { reminder: "none", details: false, now }).match(/SEQUENCE:(\d+)/)![1];
eq(Number(newer) > Number(older), true, "sequence grows when the trip is edited");

eq(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne", "escape");
const long = foldIcsLine("DESCRIPTION:" + "é".repeat(80));
eq(long.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75), true, "folding never exceeds 75 bytes");
eq(long.split("\r\n ").join(""), "DESCRIPTION:" + "é".repeat(80), "folding keeps every character");

const g = new URL(googleCalendarUrl(trip, { details: false }));
eq(g.hostname, "calendar.google.com", "google host");
eq(g.searchParams.get("dates"), "20261117/20261121", "google dates");
eq(g.searchParams.get("text"), "Winlott Meeting 2026", "google title");
eq(g.searchParams.get("location"), "Panama", "google location");
eq(g.searchParams.get("details"), null, "google no details when off");

eq(icsPath(trip.id, { reminder: "3d", details: true, download: true }), `/api/trips/${trip.id}/calendar?reminder=3d&details=1&download=1`, "file address");
eq(icsFileName("Winlott Meeting 2026"), "winlott-meeting-2026.ics", "file name");
eq(icsFileName("Bogotá / Medellín"), "bogota-medellin.ics", "file name without accents");
eq(icsFileName("!!!"), "trip.ics", "file name fallback");

eq(longDateRange("2026-11-17", "2026-11-20"), "Tue, Nov 17 – Fri, Nov 20", "long range");
eq(longDateRange("2026-11-17", null), "Tue, Nov 17", "long single day");

const mark = { target: "apple" as const, name: trip.name, destination: "Panama", start_date: trip.start_date, end_date: trip.end_date, at: now.toISOString() };
eq(markState(trip, null), "none", "not added");
eq(markState(trip, mark), "added", "added");
eq(markState({ ...trip, end_date: "2026-11-21" }, mark), "changed", "dates changed after adding");
eq(markState({ ...trip, notes: "other" }, mark), "added", "notes change alone does not need an update");

eq(guessTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "apple", "iPhone uses Apple");
eq(guessTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "apple", "iPad uses Apple");
eq(guessTarget("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "google", "Android uses Google");
eq(guessTarget("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "ics", "Windows downloads a file");

process.exit(failed ? 1 : 0);
