// Run with: npx tsx tests/telegram-upload.test.ts
import { buildScanOptions } from "../src/lib/scan-destination";
import { decideUpload, destCallback, formatSavedRef, parseDestCallback, parseSavedRef } from "../src/lib/telegram-upload";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

const today = "2026-11-05";
const TRIP = "11111111-1111-4111-8111-111111111111";
const trips = [
  { id: TRIP, name: "Miami Conference", destination: "Miami", start_date: "2026-11-03", end_date: "2026-11-07" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Houston visit", destination: "Houston", start_date: "2026-12-01", end_date: "2026-12-03" },
];
const projects = [{ id: "p1", kind: "home_project", name: "Kitchen", destination: null, start_date: null, end_date: null, status: "active" }];
const all = buildScanOptions({ trips, projects, canTrips: true, canPersonal: true, canDocuments: true });
const bizOnly = buildScanOptions({ trips: [trips[0]], projects: [], canTrips: true, canPersonal: false, canDocuments: false });
const none = buildScanOptions({ trips: [trips[1]], projects, canTrips: true, canPersonal: true, canDocuments: true });

const d1 = decideUpload({ options: all, isPdf: false, today });
eq([d1.pick?.key, d1.confident, d1.reason], [`trip:${TRIP}`, true, "Trip in progress: Miami Conference"], "a trip is in progress: save straight to it");
const d2 = decideUpload({ options: none, isPdf: false, today, last: "grocery" });
eq([d2.pick?.key, d2.confident, d2.reason], ["grocery", false, "Same as last time"], "no trip today: ask, last choice first");
eq(d2.choices[0].key, "grocery", "the guess leads the buttons");
const d3 = decideUpload({ options: all, isPdf: true, today });
eq([d3.pick?.key, d3.confident], ["document", true], "a PDF is kept as a document");
const d4 = decideUpload({ options: all, isPdf: false, today, caption: "groceries" });
eq([d4.pick?.key, d4.confident, d4.reason], ["grocery", true, "From your caption"], "caption wins over a trip in progress");
const d5 = decideUpload({ options: all, isPdf: false, today, defaultKey: `trip:${TRIP}` });
eq([d5.pick?.key, d5.reason], [`trip:${TRIP}`, "Your default trip"], "default trip that covers today");
const d6 = decideUpload({ options: none, isPdf: false, today, defaultKey: "trip:22222222-2222-4222-8222-222222222222" });
eq(d6.confident, false, "a default trip that is not happening today still asks");
const d7 = decideUpload({ options: bizOnly, isPdf: true, today });
eq([d7.pick?.key, d7.confident], [`trip:${TRIP}`, true], "business-only role, PDF: old behaviour (trip)");
const d8 = decideUpload({ options: [], isPdf: false, today });
eq([d8.pick, d8.confident, d8.choices], [null, false, []], "nowhere to put it");

eq(destCallback(`trip:${TRIP}`).length <= 64, true, "callback data fits Telegram's 64 bytes");
eq(parseDestCallback("dest:grocery"), "grocery", "parse dest callback");
eq(parseDestCallback("trip:abc"), null, "other callbacks are not dest");
eq(parseSavedRef(formatSavedRef({ table: "expenses", id: TRIP })), { table: "expenses", id: TRIP }, "saved ref round trip");
eq(parseSavedRef("users:" + TRIP), null, "unknown table refused");
eq(parseSavedRef("expenses:1 or 1=1"), null, "bad id refused");
eq(parseSavedRef(null), null, "no ref");
