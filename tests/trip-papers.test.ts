import { dueEndDate, latestPapers, papersDue, paperRemovalDay, paperSub, parsePaper, type TripPaper } from "../src/lib/trip-papers";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// removal day: a week after the trip ends
eq("removal day", paperRemovalDay("2026-11-10"), "2026-11-17");
eq("removal over a month end", paperRemovalDay("2026-12-28"), "2027-01-04");
eq("no end date keeps papers", paperRemovalDay(null), null);
eq("empty end date keeps papers", paperRemovalDay(""), null);
eq("not due the day before", papersDue("2026-11-10", "2026-11-16"), false);
eq("due on the day", papersDue("2026-11-10", "2026-11-17"), true);
eq("due after", papersDue("2026-11-10", "2026-12-01"), true);
eq("never due without an end date", papersDue(null, "2030-01-01"), false);
eq("cron cut-off", dueEndDate("2026-11-17"), "2026-11-10");

// second line
eq("note and photo", paperSub({ note: "Pickup 9:30 at arrivals", file_path: "u/papers/t/a-x.jpg" }), "Pickup 9:30 at arrivals · Photo");
eq("pdf", paperSub({ note: null, file_path: "u/papers/t/a-x.PDF" }), "PDF");
eq("note only", paperSub({ note: "Ref 4821", file_path: null }), "Ref 4821");
eq("nothing", paperSub({ note: "  ", file_path: null }), "");
eq("long note is shortened", paperSub({ note: "x".repeat(80), file_path: null }).length, 58);

// newest two
const mk = (id: string, created_at: string): TripPaper => ({ id, trip_id: "t", title: id, note: null, file_path: null, created_at });
eq("latest two", latestPapers([mk("a", "2026-11-01"), mk("c", "2026-11-03"), mk("b", "2026-11-02")]).map((p) => p.id), ["c", "b"]);
eq("fewer than two", latestPapers([mk("a", "2026-11-01")]).length, 1);

// input
eq("title needed", parsePaper({ title: "  " }).ok, false);
eq("title too long", parsePaper({ title: "x".repeat(121) }).ok, false);
eq("note too long", parsePaper({ title: "a", note: "x".repeat(1001) }).ok, false);
eq("trimmed", parsePaper({ title: " Airport transfer ", note: "" }), { ok: true, title: "Airport transfer", note: null });

if (fail) process.exit(1);
console.log("PASS trip-papers");
