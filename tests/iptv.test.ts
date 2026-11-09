import {
  addMonths, breakdown, breakdownText, computeExpiry, renewedExpiry, urgencyOf, groupClients, dueForReminder, renewalMessage, contactUrl,
  normalizeMac, cleanUrl, validateSubscription, validateCustomer, blankSubscription, cleanCustomerView, daysLabel, isDay,
} from "../src/lib/iptv";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("jan31+1", addMonths("2026-01-31", 1), "2026-02-28");
eq("leap", addMonths("2024-01-31", 1), "2024-02-29");
eq("year wrap", addMonths("2026-12-15", 1), "2027-01-15");
eq("36", addMonths("2024-02-29", 36), "2027-02-28");
eq("expiry", computeExpiry("2026-01-14", "yearly"), "2027-01-14");
eq("renew early", renewedExpiry("2026-11-14", "2026-11-10", "monthly"), "2026-12-14");
eq("renew lapsed", renewedExpiry("2026-10-01", "2026-11-10", "yearly"), "2027-11-10");
eq("breakdown", breakdown("2027-02-20", "2026-11-09"), { years: 0, months: 3, days: 11, expired: false });
eq("breakdown years", breakdownText("2029-11-09", "2026-11-09"), "3 years, 0 months, 0 days");
eq("breakdown singular", breakdownText("2026-12-10", "2026-11-09"), "0 years, 1 month, 1 day");
eq("breakdown month end", breakdown("2026-03-01", "2026-01-31"), { years: 0, months: 1, days: 1, expired: false });
eq("expired text", breakdownText("2026-11-07", "2026-11-09"), "Ended 2 days ago");
eq("urgency", [-1, 0, 7, 8, 15, 16].map(urgencyOf), ["expired", "now", "now", "soon", "soon", "ok"]);
eq("days label", [daysLabel(-2), daysLabel(0), daysLabel(1), daysLabel(9)], ["Expired 2 days ago", "Ends today", "1 day left", "9 days left"]);

const list = [
  { id: "a", client_name: "Z", expire_date: "2026-11-20", reminded_for: null },
  { id: "b", client_name: "B", expire_date: "2026-11-05", reminded_for: null },
  { id: "c", client_name: "C", expire_date: "2026-12-30", reminded_for: null },
  { id: "d", client_name: "D", expire_date: "2026-11-12", reminded_for: "2026-11-12" },
  { id: "e", client_name: "E", expire_date: "2026-11-24", reminded_for: null },
];
const g = groupClients(list, "2026-11-09");
eq("contact now", g.contactNow.map((c) => c.id), ["b", "d"]);
eq("soon", g.soon.map((c) => c.id), ["a", "e"]);
eq("later", g.later.map((c) => c.id), ["c"]);
eq("reminder skips already reminded", dueForReminder(list, "2026-11-09").map((c) => c.id), ["a", "b", "e"]);

const one = renewalMessage("Maria Lopez", [{ plan: "Basic", expire_date: "2026-11-14" }], "2026-11-09");
eq("one subscription message", one.startsWith("Hi Maria, your Basic TV service ends in 5 days (2026-11-14)."), true);
eq("past message", renewalMessage("Carlos", [{ plan: "Premium", expire_date: "2026-11-01" }], "2026-11-09").includes("ended on 2026-11-01"), true);
const two = renewalMessage("Carlos Rojas", [{ plan: "Basic", model: "Firestick", expire_date: "2026-11-27" }, { plan: "Premium", model: "MAG 524", expire_date: "2026-11-07" }], "2026-11-09");
eq("several ending are listed soonest first", two.includes("Premium · MAG 524 ended on 2026-11-07; Basic · Firestick ends in 18 days"), true);
const ofMany = renewalMessage("Carlos", [{ plan: "Premium", model: "MAG 524", expire_date: "2026-11-07" }], "2026-11-09", "", 3);
eq("only the ending one is named when there are more", ofMany.includes("your Premium · MAG 524 TV subscription ended on 2026-11-07"), true);
eq("whatsapp", contactUrl("+297 555 0142", "hi")?.startsWith("https://wa.me/2975550142?text=hi"), true);
eq("00 prefix", contactUrl("00297 555 0142", "hi")?.startsWith("https://wa.me/2975550142"), true);
eq("email", contactUrl("a@b.co", "hi")?.startsWith("mailto:a@b.co?subject="), true);
eq("bad contact", [contactUrl("", "x"), contactUrl("abc", "x"), contactUrl("a@b", "x")], [null, null, null]);

eq("mac", [normalizeMac("00-1a-79-4c-2e-91"), normalizeMac("001A794C2E91"), normalizeMac(""), normalizeMac("zz:1a"), normalizeMac("00:1A:79")], ["00:1A:79:4C:2E:91", "00:1A:79:4C:2E:91", "", null, null]);
eq("url", [cleanUrl("https://a.tv"), cleanUrl("javascript:x"), cleanUrl(" ")], ["https://a.tv", null, ""]);
eq("isDay", [isDay("2026-02-30"), isDay("2026-02-28"), isDay(5)], [false, true, false]);

const base = { ...blankSubscription("2026-01-14"), plan: "Basic", frequency: "yearly" };
const v = validateSubscription(base);
eq("valid", v.ok && v.value.expire_date, "2027-01-14");
eq("no plan", validateSubscription({ ...base, plan: "" }).ok, false);
eq("bad mac", validateSubscription({ ...base, mac: "123" }).ok, false);
eq("bad portal", validateSubscription({ ...base, portal: "ftp://x" }).ok, false);
eq("bad donation", validateSubscription({ ...base, donation: "J17 <b>" }).ok, false);
eq("donation reference kept", (() => { const r = validateSubscription({ ...base, donation: " J17454B8498X " }); return r.ok && r.value.donation; })(), "J17454B8498X");
eq("donation empty", (() => { const r = validateSubscription(base); return r.ok && r.value.donation; })(), null);
eq("expiry before start", validateSubscription({ ...base, expire_date: "2025-01-01" }).ok, false);
eq("custom expiry", (() => { const r = validateSubscription({ ...base, expire_date: "2026-06-01" }); return r.ok && r.value.expire_date; })(), "2026-06-01");
eq("customer", (() => { const r = validateCustomer({ name: " Maria  Lopez ", contact: " +297 1 " }); return r.ok && r.value; })(), { name: "Maria Lopez", contact: "+297 1" });
eq("customer no name", validateCustomer({ name: " ", contact: "" }).ok, false);

const raw = { first_name: "Carlos", owner_name: "Patrick", mac: "00:11", subscriptions: [
  { plan: "Basic", model: "Firestick", frequency: "monthly", date_subscribed: "2026-01-01", expire_date: "2026-11-27", mac: "x", history: [{ renewed_on: "2026-10-27", frequency: "monthly", expires_after: "2026-11-27", secret: 1 }] },
  { plan: "Premium", frequency: "yearly", date_subscribed: "2025-11-07", expire_date: "2026-11-07", history: [] },
  { nope: true },
] };
const cv = cleanCustomerView(raw)!;
eq("view top-level fields", Object.keys(cv).sort(), ["first_name", "owner_contact", "owner_name", "subscriptions"]);
eq("view sub fields", Object.keys(cv.subscriptions[0]).sort(), ["date_subscribed", "expire_date", "frequency", "history", "model", "plan"]);
eq("view sorted soonest first, junk dropped", cv.subscriptions.map((x) => x.plan), ["Premium", "Basic"]);
eq("view history whitelist", Object.keys(cv.subscriptions[1].history[0]).sort(), ["expires_after", "frequency", "renewed_on"]);
eq("view bad", cleanCustomerView({ subscriptions: [{ plan: "x", expire_date: "nope" }] }), null);
console.log(fail ? `${fail} FAILED` : "iptv: all checks passed");
process.exit(fail ? 1 : 0);
