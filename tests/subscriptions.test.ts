import {
  nextPayment, nextDue, monthlyCost, totalsByCurrency, approxUsd, alerts, upcoming, dueForReminder, withPrice, validateSub, importCsv, buildIcs, myShare, priceChange, renewalProgress, type Sub,
} from "../src/lib/subscriptions";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const T = "2026-11-09";
const sub = (o: Partial<Sub>): Sub => ({ id: "1", name: "X", price: 12, currency: "USD", cycle: "monthly", next_payment: "2026-11-20", category: null, status: "active", trial_ends: null, split_count: 1, remind_days: 3, cancel_url: null, notes: null, price_history: [], ...o });

eq("future stays", nextPayment("2026-12-01", "monthly", T), "2026-12-01");
eq("monthly rolls", nextPayment("2026-01-15", "monthly", T), "2026-11-15");
eq("monthly today", nextPayment("2026-01-09", "monthly", T), "2026-11-09");
eq("monthly no drift", nextPayment("2026-01-31", "monthly", "2026-03-01"), "2026-03-31");
eq("month end clamp", nextPayment("2026-01-31", "monthly", "2026-02-15"), "2026-02-28");
eq("yearly", nextPayment("2024-03-05", "yearly", T), "2027-03-05");
eq("quarterly", nextPayment("2026-01-10", "quarterly", T), "2027-01-10");
eq("weekly", nextPayment("2026-11-01", "weekly", T), "2026-11-15");
eq("trial first", nextDue(sub({ trial_ends: "2026-11-11" }), T), "2026-11-11");
eq("trial over", nextDue(sub({ trial_ends: "2026-11-01" }), T), "2026-11-20");

eq("yearly per month", monthlyCost(sub({ price: 120, cycle: "yearly" }), T), 10);
eq("split", monthlyCost(sub({ price: 15.99, split_count: 3 }), T), 5.33);
eq("share", myShare({ price: 15.99, split_count: 3 }), 5.33);
eq("paused free", monthlyCost(sub({ status: "paused" }), T), 0);
eq("trial free", monthlyCost(sub({ trial_ends: "2026-11-30" }), T), 0);
eq("weekly", Math.round(monthlyCost(sub({ price: 3, cycle: "weekly" }), T) * 100) / 100, 13);
const totals = totalsByCurrency([sub({ price: 10 }), sub({ id: "2", price: 120, cycle: "yearly" }), sub({ id: "3", price: 5, currency: "EUR" })], T);
eq("totals", totals, [{ currency: "USD", monthly: 20, yearly: 240 }, { currency: "EUR", monthly: 5, yearly: 60 }]);
eq("approx usd null on unknown", approxUsd([{ currency: "ZZZ", monthly: 5 }]), null);
eq("approx usd", approxUsd([{ currency: "USD", monthly: 5 }]), 5);

const ph = [{ price: 15.49, at: "2026-03-01" }, { price: 17.99, at: "2026-09-01" }];
eq("price change", priceChange({ price_history: ph }), { from: 15.49, to: 17.99, percent: 16 });
eq("alerts", alerts([sub({ id: "a", name: "Duo", trial_ends: "2026-11-11" }), sub({ id: "b", name: "Net", price_history: ph }), sub({ id: "c", trial_ends: "2026-12-30" })], T).map((a) => [a.id, a.kind]), [["a", "trial"], ["b", "price"]]);
eq("with price same", withPrice(ph, 17.99, T), ph);
eq("with price new", withPrice(ph, 19, T).length, 3);
eq("upcoming", upcoming([sub({ id: "a", next_payment: "2026-12-30" }), sub({ id: "b", next_payment: "2026-11-12" }), sub({ id: "c", status: "cancelled", next_payment: "2026-11-12" })], T).map((s) => s.id), ["b"]);
eq("reminder", dueForReminder([sub({ id: "a", next_payment: "2026-11-11" }), sub({ id: "b", next_payment: "2026-11-11", reminded_for: "2026-11-11" }), sub({ id: "c", next_payment: "2026-11-30" })], T).map((s) => s.id), ["a"]);

const form = { name: " Netflix ", price: "17,99", currency: "usd", cycle: "monthly", next_payment: "2026-12-01", category: "", trial_ends: "", split_count: "", remind_days: "", cancel_url: "", notes: "" };
const ok = validateSub(form);
eq("valid sub", ok.ok && [ok.value.name, ok.value.price, ok.value.currency, ok.value.split_count, ok.value.remind_days], ["Netflix", 17.99, "USD", 1, 3]);
for (const [m, o] of [["no name", { name: "" }], ["no price", { price: "" }], ["neg", { price: "-1" }], ["cycle", { cycle: "daily" }], ["date", { next_payment: "soon" }], ["split", { split_count: "50" }], ["remind", { remind_days: "40" }], ["url", { cancel_url: "javascript:1" }]] as const)
  eq(`invalid ${m}`, validateSub({ ...form, ...o }).ok, false);

const csv = 'Name,Amount,Currency,Billing,Date\nNetflix,17.99,USD,monthly,2026-12-01\n"Gym, Downtown",30,EUR,Month,2026-12-05\nBad,abc,USD,monthly,2026-12-01\n';
const imp = importCsv(csv, T);
eq("csv rows", imp.rows.map((r) => [r.name, r.price, r.cycle]), [["Netflix", 17.99, "monthly"], ["Gym, Downtown", 30, "monthly"]]);
eq("csv errors", imp.errors.length, 1);
eq("csv missing header", importCsv("foo,bar\n1,2", T).errors.length, 1);

const ics = buildIcs([sub({ name: "Net, flix" }), sub({ id: "2", status: "cancelled" })], T);
eq("ics events", (ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
eq("ics escapes", ics.includes("SUMMARY:Net\\, flix"), true);
eq("ics rule", ics.includes("RRULE:FREQ=MONTHLY") && ics.includes("DTSTART;VALUE=DATE:20261120"), true);
// renewal progress bar
{
  const p = renewalProgress(sub({ next_payment: "2026-11-20" }), T)!;
  eq("progress: monthly, 11 days left of a 31-day period", [p.from, p.to, p.daysLeft, p.periodDays, p.pct], ["2026-10-20", "2026-11-20", 11, 31, 65]);
  eq("progress: pays today means a full bar and no days left", [renewalProgress(sub({ next_payment: "2026-11-09" }), T)!.daysLeft, renewalProgress(sub({ next_payment: "2026-11-09" }), T)!.pct], [0, 100]);
  eq("progress: weekly", renewalProgress(sub({ cycle: "weekly", next_payment: "2026-11-12" }), T)!.pct, Math.round((4 / 7) * 100));
  eq("progress: yearly rolls to this year's date", renewalProgress(sub({ cycle: "yearly", next_payment: "2025-12-09" }), T)!.daysLeft, 30);
  eq("progress: none while in a free trial", renewalProgress(sub({ trial_ends: "2026-11-12" }), T), null);
  eq("progress: none when paused", renewalProgress(sub({ status: "paused" }), T), null);
}
console.log(fail ? `${fail} FAILED` : "subscriptions: all checks passed");
process.exit(fail ? 1 : 0);
