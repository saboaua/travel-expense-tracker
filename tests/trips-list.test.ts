import { tripPhase, phaseLabel, sortActive, groupCompletedByYear, matchesQuery, type ListTrip } from "../src/lib/trips-list";
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); };
const T = "2026-11-03";
const mk = (id: string, start: string, end: string | null, status = "active", total = 10, name = id, dest: string | null = null): ListTrip => ({ id, name, destination: dest, start_date: start, end_date: end, status, total, count: 1 });

eq("ongoing", tripPhase(mk("a", "2026-11-01", "2026-11-05"), T), "ongoing");
eq("ongoing no end date, starts today", tripPhase(mk("a", T, null), T), "ongoing");
eq("upcoming", tripPhase(mk("a", "2026-11-10", "2026-11-12"), T), "upcoming");
eq("ended but open", tripPhase(mk("a", "2026-10-01", "2026-10-05"), T), "ended");
eq("completed wins", tripPhase(mk("a", "2026-11-01", "2026-11-05", "completed"), T), "completed");
eq("last day boundary", tripPhase(mk("a", "2026-10-30", T), T), "ongoing");

eq("label upcoming", phaseLabel(mk("a", "2026-11-10", null), T), "In 7 days");
eq("label tomorrow", phaseLabel(mk("a", "2026-11-04", null), T), "Starts tomorrow");
eq("label starts today", phaseLabel(mk("a", T, "2026-11-06"), T), "Day 1 · 3 left");
eq("label mid trip", phaseLabel(mk("a", "2026-11-01", "2026-11-05"), T), "Day 3 · 2 left");
eq("label last day", phaseLabel(mk("a", "2026-11-01", T), T), "Last day");
eq("label ended", phaseLabel(mk("a", "2026-10-01", "2026-10-02"), T), "Ended · ready to close");

const trips = [
  mk("old-end", "2026-09-01", "2026-09-03"),
  mk("later", "2026-12-01", "2026-12-03"),
  mk("soon", "2026-11-10", "2026-11-11"),
  mk("now", "2026-11-02", "2026-11-04"),
  mk("ended2", "2026-10-10", "2026-10-12"),
  mk("done", "2026-05-01", "2026-05-03", "completed"),
];
eq("active order", sortActive(trips, T).map((t) => t.id), ["now", "soon", "later", "ended2", "old-end"]);

const done = [
  mk("c1", "2025-03-01", null, "completed", 100),
  mk("c2", "2026-05-01", null, "completed", 50),
  mk("c3", "2026-01-01", null, "completed", 25),
  mk("x", "2026-02-01", null, "active", 999),
];
const g = groupCompletedByYear(done);
eq("years desc", g.map((y) => y.year), ["2026", "2025"]);
eq("year totals", g.map((y) => y.total), [75, 100]);
eq("within year newest first", g[0].trips.map((t) => t.id), ["c2", "c3"]);
eq("none", groupCompletedByYear([]), []);

const p = mk("p", "2026-01-01", null, "active", 0, "Panama Conference", "Panamá City, Panama");
eq("search name", matchesQuery(p, "conf"), true);
eq("search accent", matchesQuery(p, "panama city"), true);
eq("search both words any order", matchesQuery(p, "city conference"), true);
eq("search miss", matchesQuery(p, "tokyo"), false);
eq("empty query", matchesQuery(p, "  "), true);
eq("null destination", matchesQuery(mk("n", "2026-01-01", null), "zzz"), false);

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
