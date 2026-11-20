import { chargesInMonth, subPaid, subsOnCards, type Sub } from "../src/lib/subscriptions";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const sub = (o: Partial<Sub>): Sub => ({ id: "s1", name: "Netflix", price: 22.5, currency: "AWG", cycle: "monthly", next_payment: "2026-12-05", category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], ...o });

eq(subPaid({}), "credit", "no choice means credit card");
eq(subPaid({ paid_with: "debit" }), "debit", "a chosen debit card is kept");
eq(subPaid({ paid_with: "bogus" }), "credit", "an unknown value falls back to credit card");
eq(chargesInMonth(sub({}), "2026-11"), ["2026-11-05"], "a monthly plan entered for December was charged in November too");
eq(chargesInMonth(sub({}), "2026-12"), ["2026-12-05"], "and is charged in December");
eq(chargesInMonth(sub({ next_payment: "2025-01-31" }), "2026-02"), ["2026-02-28"], "the last day of the month stays the last day");
eq(chargesInMonth(sub({ cycle: "yearly", next_payment: "2026-03-10" }), "2026-11"), [], "a yearly plan is not charged in other months");
eq(chargesInMonth(sub({ cycle: "yearly", next_payment: "2026-03-10" }), "2026-03"), ["2026-03-10"], "a yearly plan is charged in its month");
eq(chargesInMonth(sub({ cycle: "weekly", next_payment: "2026-11-02" }), "2026-11").length, 5, "a weekly plan is charged every week (5 Mondays in November 2026)");
eq(chargesInMonth(sub({ cycle: "quarterly", next_payment: "2026-11-15" }), "2026-08"), ["2026-08-15"], "a quarterly plan counts back every 3 months");
eq(chargesInMonth(sub({ trial_ends: "2026-12-01" }), "2026-11"), [], "nothing is charged during a free trial");

const list = [sub({ id: "a" }), sub({ id: "b", name: "Spotify", price: 12.7, next_payment: "2026-11-12" }), sub({ id: "c", name: "Gym", price: 55, paid_with: "debit", next_payment: "2026-11-01" }), sub({ id: "d", name: "Family", price: 30, split_count: 3, next_payment: "2026-11-20" }), sub({ id: "e", status: "paused" }), sub({ id: "f", currency: "USD" })];
const r = subsOnCards(list, "2026-11", "AWG");
eq(r.total, { credit: 45.2, debit: 55, cash: 0 }, "credit and debit totals for the month: 22.50 + 12.70 + my 10 of a split plan; debit 55");
eq(r.items.map((i) => i.id), ["a", "b", "c", "d"], "paused and other-currency subscriptions are left out");
eq(subsOnCards([], "2026-11", "AWG").total, { credit: 0, debit: 0, cash: 0 }, "no subscriptions, no totals");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
