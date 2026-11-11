import { tripBadge, legTag, limitFlights, moreFlightsLabel } from "../src/lib/trip-card";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("badge: days left", tripBadge("2026-11-17", "2026-11-20", "2026-11-10")?.label, "Upcoming · 7 days left");
eq("badge: one day", tripBadge("2026-11-11", null, "2026-11-10")?.label, "Upcoming · 1 day left");
eq("badge: in progress", tripBadge("2026-11-08", "2026-11-12", "2026-11-10")?.tone, "progress");
eq("badge: last day is still in progress", tripBadge("2026-11-08", "2026-11-10", "2026-11-10")?.tone, "progress");
eq("badge: single-day trip today", tripBadge("2026-11-10", null, "2026-11-10")?.tone, "progress");
eq("badge: passed", tripBadge("2026-10-01", "2026-10-05", "2026-11-10")?.label, "Passed");
eq("badge: no dates, no badge", tripBadge(null, null, "2026-11-10"), null);
eq("badge: only an end date", tripBadge(null, "2026-11-20", "2026-11-10")?.tone, "upcoming");

eq("leg tag outbound", legTag("outbound"), "OUTBOUND");
eq("leg tag return", legTag("return"), "RETURN");
eq("leg tag connection", legTag("connection"), "CONNECTION");

eq("limit: two fit", limitFlights([1, 2]), { shown: [1, 2], more: 0 });
eq("limit: three show two and one more", limitFlights([1, 2, 3]), { shown: [1, 2], more: 1 });
eq("limit: none", limitFlights([]), { shown: [], more: 0 });
eq("more: one", moreFlightsLabel(1), "+1 more flight");
eq("more: many", moreFlightsLabel(3), "+3 more flights");

console.log(fail ? `${fail} FAILED` : "trip-card: all checks passed");
process.exit(fail ? 1 : 0);
