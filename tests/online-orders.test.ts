import { arrivesText, asSite, daysUntil, mainCurrency, monthBySite, onItsWay, siteLabel } from "../src/lib/personal/online-orders";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const o = (id: string, site: string | null, date: string, total: number, arrives: string | null = null, currency = "USD") => ({ id, store: "x", purchase_date: date, total, currency, online_site: site, arrives_on: arrives });

eq("sites are cleaned", [asSite(" Amazon "), asSite("ebay"), asSite("temu"), asSite(null), siteLabel("aliexpress"), siteLabel("zz")], ["amazon", "ebay", null, null, "AliExpress", ""]);
eq("days between dates", [daysUntil("2026-12-03", "2026-11-25"), daysUntil("2026-11-25", "2026-11-25"), daysUntil("2026-11-20", "2026-11-25")], [8, 0, -5]);
eq("arrival wording", [arrivesText(0), arrivesText(1), arrivesText(8)], ["Today", "Tomorrow", "In 8 days"]);
const rows = [o("1", "amazon", "2026-11-22", 67.48, "2026-12-03"), o("2", "aliexpress", "2026-11-10", 14.2, "2026-12-12"), o("3", "ebay", "2026-11-20", 9, "2026-11-22"), o("4", null, "2026-11-21", 50, "2026-12-01"), o("5", "amazon", "2026-11-05", 20), o("6", "amazon", "2026-11-28", -10), o("7", "amazon", "2026-10-30", 99), o("8", "amazon", "2026-11-02", 5, null, "AWG")];
eq("on its way: not yet arrived, online only, soonest first", onItsWay(rows, "2026-11-25").map((r) => [r.id, r.days]), [["1", 8], ["2", 17]]);
const m = monthBySite(rows, "2026-11", "USD");
eq("month total by site, largest first, refund counts as negative", [m.total, m.orders, m.sites.map((s) => [s.site, s.total, s.orders])], [100.68, 5, [["amazon", 77.48, 3], ["aliexpress", 14.2, 1], ["ebay", 9, 1]]]);
eq("other months and currencies stay out", monthBySite(rows, "2026-10", "USD").total, 99);
eq("main currency of the month", [mainCurrency(rows, "2026-11"), mainCurrency(rows, "2025-01")], ["USD", null]);
process.exit(fail ? 1 : 0);
