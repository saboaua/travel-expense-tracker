import { currenciesOf, filterReceipts, normPaid, normTripRef, paidLabel, paidTotals, suggestTrip, type TripChoice } from "../src/lib/paid-with";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const id = "11111111-2222-4333-8444-555555555555";

eq("normPaid keeps the three types", [normPaid("cash"), normPaid("debit"), normPaid("credit"), normPaid("amex"), normPaid(null)], ["cash", "debit", "credit", null, null]);
eq("labels", [paidLabel("credit"), paidLabel("debit"), paidLabel("cash"), paidLabel(null)], ["Credit card", "Debit card", "Cash", "Not set"]);
eq("trip refs", [normTripRef(`trip:${id}`), normTripRef(`ptrip:${id}`), normTripRef("trip:x"), normTripRef("other:" + id), normTripRef(5)], [`trip:${id}`, `ptrip:${id}`, null, null, null]);

const rows = [
  { paid_with: "credit" as const, amount: 84.5, currency: "USD" }, { paid_with: "credit" as const, amount: 329, currency: "USD" },
  { paid_with: "debit" as const, amount: 40.1, currency: "USD" }, { paid_with: null, amount: 10, currency: "USD" },
  { paid_with: "cash" as const, amount: 5, currency: "AWG" },
];
const t = paidTotals(rows, "USD");
eq("totals per type in one currency", [t.credit, t.debit, t.cash, t.none, t.total], [413.5, 40.1, 0, 10, 463.6]);
eq("counts", t.count, { credit: 2, debit: 1, cash: 0, none: 1 });
eq("other currency left out", paidTotals(rows, "AWG").total, 5);
eq("currencies, biggest first", currenciesOf(rows), ["USD", "AWG"]);

const trips: TripChoice[] = [
  { ref: `trip:${id}`, label: "Panama", kind: "trip", start: "2026-11-15", end: "2026-11-22" },
  { ref: "ptrip:aaaaaaaa-2222-4333-8444-555555555555", label: "Curacao", kind: "ptrip", start: "2026-11-20", end: "2026-11-22" },
];
eq("a business trip on that day is suggested first", suggestTrip(trips, "2026-11-20")?.label, "Panama");
eq("a personal trip when no business trip", suggestTrip(trips, "2026-11-23"), null);
eq("personal trip alone", suggestTrip([trips[1]], "2026-11-21")?.label, "Curacao");
eq("two business trips that day: no guess", suggestTrip([trips[0], { ...trips[0], ref: `trip:bbbbbbbb-2222-4333-8444-555555555555`, label: "Other" }], "2026-11-20"), null);

const rc = [{ paid_with: "credit" as const, trip_ref: `trip:${id}` }, { paid_with: "debit" as const, trip_ref: null }, { paid_with: null, trip_ref: null }];
eq("filter by card", filterReceipts(rc, { paid: "credit", trip: null }).length, 1);
eq("filter not set", filterReceipts(rc, { paid: "none", trip: null }).length, 1);
eq("filter by trip", filterReceipts(rc, { paid: null, trip: `trip:${id}` }).length, 1);
eq("filters combine", filterReceipts(rc, { paid: "debit", trip: `trip:${id}` }).length, 0);
eq("not on a trip", filterReceipts(rc, { paid: null, trip: "none" }).length, 2);

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("PASS paid-with");
