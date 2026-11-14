import { pushMessage, shortDate, clockText, PUSH_TEXT } from "../src/lib/push-text";
import { normalizePushSettings, parsePushPatch, hourLabel, DEFAULT_PUSH_SETTINGS } from "../src/lib/push-prefs";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const body = (k: Parameters<typeof pushMessage>[0], d: Parameters<typeof pushMessage>[1], detail: "details" | "private" = "details") => pushMessage(k, d, detail, "2026-11-10").body;

// dates and clock
eq("short date", shortDate("2026-11-17", "2026-11-10"), "Nov 17");
eq("other year shows the year", shortDate("2027-01-09", "2026-11-10"), "Jan 9, 2027");
eq("clock", [clockText("2026-11-17T09:45"), clockText("2026-11-17T00:05"), clockText("2026-11-17T12:30"), clockText("2026-11-17T21:00"), clockText(null)], ["9:45 AM", "12:05 AM", "12:30 PM", "9:00 PM", ""]);

// sharing
eq("invite", body("invite", { by: "Alice" }), "Alice invited you to share.");
eq("accepted", body("accepted", { by: "Bob" }), "Bob accepted your invite.");
eq("accepted without a name stays generic", body("accepted", undefined), PUSH_TEXT.accepted.body);
eq("shared trip", body("shared", { by: "Alice", item: "Winlott Meeting", itemKind: "trip" }), "Alice shared the trip Winlott Meeting with you.");
eq("shared card", body("shared", { by: "Alice", item: "Greenfield", itemKind: "loyalty_card" }), "Alice shared the loyalty card Greenfield with you.");
eq("shared with no item name", body("shared", { by: "Alice" }), "Alice shared something with you.");
eq("unshared", body("unshared", { by: "Alice", item: "Winlott Meeting", itemKind: "trip" }), "Alice stopped sharing the trip Winlott Meeting.");
eq("ended", body("ended", { by: "Alice" }), "Alice ended sharing with you.");
eq("view", body("view", { by: "Bob", item: "Winlott Meeting" }), "Bob opened Winlott Meeting.");

// subscriptions and IPTV
eq("one subscription", body("subscription", { subscriptions: [{ name: "Netflix", due: "2026-11-13" }], days: 3 }), "Netflix is due in 3 days (Nov 13).");
eq("due today", body("subscription", { subscriptions: [{ name: "Netflix", due: "2026-11-10" }], days: 0 }), "Netflix is due today (Nov 10).");
eq("several subscriptions", body("subscription", { subscriptions: [{ name: "Netflix", due: "2026-11-13" }, { name: "iCloud", due: "2026-11-14" }, { name: "Gym", due: "2026-11-15" }], days: 3 }), "Netflix is due in 3 days (Nov 13), and 2 more soon.");
eq("iptv count and first date, no names", body("iptv", { count: 3, date: "2026-11-20" }), "3 IPTV clients expire within 15 days. First: Nov 20.");
eq("iptv one", body("iptv", { count: 1 }), "1 IPTV client expires within 15 days.");

// trips and flights
eq("trip in 3 days", body("trip", { trip: "Winlott Meeting", days: 3, date: "2026-11-13" }), "Winlott Meeting starts in 3 days (Nov 13). Check your documents.");
eq("trip tomorrow with the flight", body("trip", { trip: "Winlott Meeting", days: 1, date: "2026-11-11", flight: { number: "CM 312", from: "AUA", to: "PTY", time: "9:45 AM" } }), "Winlott Meeting starts tomorrow (Nov 11). Flight CM 312 leaves AUA at 9:45 AM.");
eq("trip tomorrow, no flight", body("trip", { trip: "Winlott Meeting", days: 1, date: "2026-11-11" }), "Winlott Meeting starts tomorrow (Nov 11).");
eq("flight tomorrow", body("flightTomorrow", { flight: { number: "CM 312", from: "AUA", to: "PTY", time: "9:45 AM" } }), "Flight tomorrow: CM 312 AUA to PTY, 9:45 AM.");
eq("flight tomorrow, route unknown", body("flightTomorrow", { flight: { number: "CM 312", from: null, to: null, time: null } }), "Flight tomorrow: CM 312.");
eq("after the trip", body("afterTrip", { trip: "Winlott Meeting" }), "Winlott Meeting ended. Add your last receipts.");
eq("flight status keeps its wording", body("flight", { flight: { number: "CM 312", from: "AUA", to: "PTY", time: "9:45 AM" } }), PUSH_TEXT.flight.body);

// documents: the kind of document, never a number
eq("document soon", body("document", { label: "Passport", days: 60, date: "2027-01-09" }), "Your passport expires in 60 days (Jan 9, 2027).");
eq("document in months", body("document", { label: "Passport", days: 200, date: "2027-05-29" }), "Your passport expires in about 7 months (May 29, 2027).");
eq("document today", body("document", { label: "Visa / e-visa", days: 0, date: "2026-11-10" }), "Your visa / e-visa expires today (Nov 10).");
eq("document expired", body("document", { label: "ID card", days: -3, date: "2026-11-07" }), "Your id card expired 3 days ago (Nov 7).");

// account request
eq("account request", body("accountRequest", { by: "Maria", item: "Carlos" }), "Account request from Maria. Recommended by Carlos.");
eq("account request, nobody recommended", body("accountRequest", { by: "Maria" }), "Account request from Maria.");
eq("account request private", pushMessage("accountRequest", { by: "Maria" }, "private").body, "A new account request arrived.");
// support
eq("support", body("support", { by: "Maria", subject: "Cannot add a receipt" }), "Support request from Maria: “Cannot add a receipt”.");
eq("support without a subject", body("support", { by: "Maria" }), "Support request from Maria.");
eq("support text is cleaned and cut", body("support", { by: "Maria", subject: "a\nb" + "x".repeat(100) }).includes("\n"), false);

// private style and missing facts
eq("private style is the old wording", body("shared", { by: "Alice", item: "Winlott Meeting", itemKind: "trip" }, "private"), PUSH_TEXT.shared.body);
eq("private style for a trip", body("trip", { trip: "Winlott Meeting", days: 3 }, "private"), PUSH_TEXT.trip.body);
eq("no facts, generic", body("document", {}), PUSH_TEXT.document.body);
eq("title", pushMessage("trip", { trip: "X", days: 1 }, "details").title, "Lifolio");
// nothing that looks like an amount, number or code ever goes in
const every = ["invite", "accepted", "shared", "view", "subscription", "iptv", "trip", "flightTomorrow", "afterTrip", "document", "support"] as const;
eq("no digits-only codes are added by the wording", every.every((k) => !/\b[A-Z0-9]{6,}\b/.test(body(k, { by: "Alice", item: "Trip", subscriptions: [{ name: "Netflix", due: "2026-11-13" }], days: 3, count: 2, trip: "Trip", flight: { number: "CM 312", from: "AUA", to: "PTY", time: "9:45 AM" }, label: "Passport", subject: "Hello" }))), true);

// fixed costs
eq("gambling near", body("gambling", { item: "near" }), "You have used 80% of your gambling limit this month.");
eq("gambling over", body("gambling", { item: "over" }), "You are over your gambling limit this month.");
eq("gambling private", body("gambling", { item: "over" }, "private"), PUSH_TEXT.gambling.body);
eq("yearly bill names it and the date", pushMessage("fixedYearly", { item: "License plate", days: 7, date: "2027-06-30" }, "details", "2027-06-23").body, "License plate is due in 7 days (Jun 30).");
eq("yearly bill without facts", body("fixedYearly", {}), PUSH_TEXT.fixedYearly.body);
eq("payment tomorrow", pushMessage("fixedMonthly", { item: "Home mortgage", count: 1, date: "2026-12-01" }, "details", "2026-11-30").body, "Home mortgage is due tomorrow (Dec 1).");
eq("payment tomorrow with more", pushMessage("fixedMonthly", { item: "Home mortgage", count: 3, date: "2026-12-01" }, "details", "2026-11-30").body, "Home mortgage is due tomorrow (Dec 1), and 2 more.");
eq("no amounts in fixed cost alerts", ["gambling", "fixedYearly", "fixedMonthly"].every((k) => !/\d{3,}/.test(body(k as "gambling", { item: "Car insurance", days: 7, count: 1 }))), true);
// switches
eq("new switches: budget, gambling and yearly bills on, payment day off", [normalizePushSettings(null).budget, normalizePushSettings(null).gambling, normalizePushSettings(null).yearlyBills, normalizePushSettings(null).paymentDay], [true, true, true, false]);
eq("budget alerts keep what the person had for reminders", normalizePushSettings({ reminders: false }).budget, false);
eq("a saved budget switch wins", normalizePushSettings({ reminders: false, budget: true }).budget, true);
eq("patch: payment day", parsePushPatch({ paymentDay: true }), { paymentDay: true });

// settings
eq("defaults", normalizePushSettings(null), DEFAULT_PUSH_SETTINGS);
eq("old saved prefs: flight changes follow trips", normalizePushSettings({ invites: true, shared: true, views: false, reminders: true, trips: false }).flights, false);
eq("old saved prefs: iptv follows reminders", normalizePushSettings({ reminders: false }).iptv, false);
eq("a saved flights switch wins", normalizePushSettings({ trips: false, flights: true }).flights, true);
eq("new switches default on", normalizePushSettings({ trips: false }).documents, true);
eq("views stays off", normalizePushSettings({}).views, false);
eq("quiet hours bad values fall back", normalizePushSettings({ quiet: { on: true, start: 99, end: "x" } }).quiet, { on: true, start: 22, end: 7 });
eq("style", normalizePushSettings({ detail: "private" }).detail, "private");
eq("bad style ignored", normalizePushSettings({ detail: "loud" }).detail, "details");
eq("patch: a switch", parsePushPatch({ documents: false }), { documents: false });
eq("patch: wrong type", parsePushPatch({ documents: "no" }), null);
eq("patch: style", parsePushPatch({ detail: "private" }), { detail: "private" });
eq("patch: bad style", parsePushPatch({ detail: "x" }), null);
eq("patch: quiet", parsePushPatch({ quiet: { on: true, start: 21, end: 6 } }), { quiet: { on: true, start: 21, end: 6 } });
eq("patch: quiet hour out of range", parsePushPatch({ quiet: { on: true, start: 24, end: 6 } }), null);
eq("patch: unknown keys are dropped, empty is refused", parsePushPatch({ admin: true }), null);
eq("hour label", [hourLabel(0), hourLabel(7), hourLabel(12), hourLabel(22)], ["12:00 AM", "7:00 AM", "12:00 PM", "10:00 PM"]);

console.log(fail ? `${fail} FAILED` : "push-text: all checks passed");
process.exit(fail ? 1 : 0);
