// Run with: npx tsx tests/scan-destination.test.ts
import { buildScanOptions, destinationMatches, isHome, suggestDestination, countryName } from "../src/lib/scan-destination";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

const today = "2026-11-05";
const trips = [
  { id: "t1", name: "Miami Conference", destination: "Miami, Florida, USA", start_date: "2026-11-03", end_date: "2026-11-07", range: "3 - 7 Nov" },
  { id: "t2", name: "Houston visit", destination: "Houston, USA", start_date: "2026-12-01", end_date: "2026-12-03" },
];
const projects = [
  { id: "p1", kind: "home_project", name: "Kitchen", destination: null, start_date: null, end_date: null, status: "active" },
  { id: "p2", kind: "personal_trip", name: "Curacao weekend", destination: "Willemstad, Curacao", start_date: "2026-11-20", end_date: "2026-11-22", status: "active" },
  { id: "p3", kind: "home_project", name: "Old garage", destination: null, start_date: null, end_date: null, status: "completed" },
];
const all = buildScanOptions({ trips, projects, canTrips: true, canPersonal: true, canDocuments: true });
const bizOnly = buildScanOptions({ trips: [trips[0]], projects, canTrips: true, canPersonal: false, canDocuments: false });

eq(countryName("AW"), "Aruba", "country name from code");
eq(countryName("x"), null, "bad code");
eq(all.map((o) => o.key), ["trip:t1", "trip:t2", "grocery", "project:p1", "ptrip:p2", "document"], "options: completed projects left out, order");
eq(buildScanOptions({ trips, projects, canTrips: false, canPersonal: true, canDocuments: false }).map((o) => o.key), ["grocery", "project:p1", "ptrip:p2"], "role without trips");

eq(destinationMatches("Miami, Florida, USA", { city: "Miami", countryCode: "US" }), true, "city in destination");
eq(destinationMatches("Miami, Florida, USA", { city: "Orlando", countryCode: "US" }), false, "other city, same country");
eq(destinationMatches("Aruba", { city: "Oranjestad", countryCode: "AW" }), true, "destination is just the country");
eq(destinationMatches("Oranjestad, Aruba", { city: "Oranjestad", countryCode: "AW" }), true, "accents and case ignored");
eq(destinationMatches("San Juan, Puerto Rico", { city: "Jua", countryCode: "PR" }), false, "whole words only");
eq(destinationMatches(null, { city: "Miami", countryCode: "US" }), false, "no destination");
eq(destinationMatches("Miami", null), false, "no place");

eq(isHome({ city: "Oranjestad", countryCode: "AW" }, { country: "Aruba" }), true, "home by country");
eq(isHome({ city: "Oranjestad", countryCode: "AW" }, { city: "Oranjestad", country: "Aruba" }), true, "home by city");
eq(isHome({ city: "Noord", countryCode: "AW" }, { city: "Oranjestad", country: "Aruba" }), false, "other city in home country is not home when a city is set");
eq(isHome({ city: "Miami", countryCode: "US" }, { country: "Aruba" }), false, "away");
eq(isHome({ city: "Miami", countryCode: "US" }, null), false, "no home set");

const s1 = suggestDestination({ mode: "scan", options: all, place: { city: "Miami", countryCode: "US" }, home: { country: "Aruba" }, today });
eq([s1.pick?.key, s1.confident, s1.reason], ["trip:t1", true, "You're in Miami"], "scan in the trip's city: straight through");
const s2 = suggestDestination({ mode: "scan", options: all, place: { city: "Oranjestad", countryCode: "AW" }, home: { country: "Aruba" }, today });
eq([s2.pick?.key, s2.confident], ["grocery", false], "scan at home: sheet, groceries first");
const s2b = suggestDestination({ mode: "scan", options: all, place: { city: "Oranjestad", countryCode: "AW" }, home: { country: "Aruba" }, today, last: "project:p1" });
eq([s2b.pick?.key, s2b.confident], ["project:p1", false], "scan at home: last personal choice wins");
const s2c = suggestDestination({ mode: "scan", options: all, place: { city: "Oranjestad", countryCode: "AW" }, home: { country: "Aruba" }, today, last: "trip:t1" });
eq(s2c.pick?.key, "grocery", "scan at home: a last business choice does not drag you back to the trip");
const s3 = suggestDestination({ mode: "scan", options: all, place: { city: "Panama City", countryCode: "PA" }, home: { country: "Aruba" }, today });
eq([s3.pick?.key, s3.confident], ["trip:t1", false], "scan somewhere new: trip happening today, sheet");
const s4 = suggestDestination({ mode: "scan", options: all, place: null, home: { country: "Aruba" }, today });
eq([s4.pick?.key, s4.confident], ["trip:t1", false], "location blocked, several places to go: sheet");
const s5 = suggestDestination({ mode: "scan", options: bizOnly, place: null, today });
eq([s5.pick?.key, s5.confident], ["trip:t1", true], "business-only, one trip, location blocked: same as before");
const twoMiami = buildScanOptions({ trips: [trips[0], { ...trips[1], destination: "Miami Beach, USA", start_date: "2026-11-01", end_date: "2026-11-30" }], projects: [], canTrips: true, canPersonal: false, canDocuments: false });
const s6 = suggestDestination({ mode: "scan", options: twoMiami, place: { city: "Miami", countryCode: "US" }, today });
eq(s6.confident, false, "two trips match the place: ask");

const u1 = suggestDestination({ mode: "upload", options: all, photoDate: "2026-11-04", today: "2026-11-10", place: { city: "Oranjestad", countryCode: "AW" }, home: { country: "Aruba" } });
eq([u1.pick?.key, u1.confident], ["trip:t1", true], "upload: photo date inside a trip, even from home later");
const u2 = suggestDestination({ mode: "upload", options: all, photoDate: "2026-10-01", today, last: "grocery" });
eq([u2.pick?.key, u2.confident, u2.reason], ["grocery", false, "Same as last time"], "upload: date outside every trip, last choice");
const u3 = suggestDestination({ mode: "upload", options: all, photoDate: null, today });
eq(u3.confident, false, "upload without a date asks");
const u4 = suggestDestination({ mode: "upload", options: all, photoDate: "2026-11-04", today, looksLikeId: true });
eq([u4.pick?.key, u4.confident], ["document", false], "upload that looks like an ID: Document suggested, sheet shown");
const u5 = suggestDestination({ mode: "upload", options: bizOnly, photoDate: "2026-09-01", today });
eq(u5.pick?.key, "trip:t1", "upload, business only: falls back to the trip");
