import {
  addMonths, breakdown, breakdownText, computeExpiry, renewedExpiry, urgencyOf, groupClients, dueForReminder, renewalMessage, contactUrl,
  normalizeMac, cleanUrl, validateClient, blankClient, cleanClientView, daysLabel, isDay,
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

const msg = renewalMessage({ client_name: "Maria Lopez", plan: "Basic", expire_date: "2026-11-14" }, "2026-11-09");
eq("message", msg.startsWith("Hi Maria, your Basic TV service ends in 5 days (2026-11-14)."), true);
eq("past message", renewalMessage({ client_name: "Carlos", plan: "Premium", expire_date: "2026-11-01" }, "2026-11-09").includes("ended on 2026-11-01"), true);
eq("whatsapp", contactUrl("+297 555 0142", "hi")?.startsWith("https://wa.me/2975550142?text=hi"), true);
eq("00 prefix", contactUrl("00297 555 0142", "hi")?.startsWith("https://wa.me/2975550142"), true);
eq("email", contactUrl("a@b.co", "hi")?.startsWith("mailto:a@b.co?subject="), true);
eq("bad contact", [contactUrl("", "x"), contactUrl("abc", "x"), contactUrl("a@b", "x")], [null, null, null]);

eq("mac", [normalizeMac("00-1a-79-4c-2e-91"), normalizeMac("001A794C2E91"), normalizeMac(""), normalizeMac("zz:1a"), normalizeMac("00:1A:79")], ["00:1A:79:4C:2E:91", "00:1A:79:4C:2E:91", "", null, null]);
eq("url", [cleanUrl("https://a.tv"), cleanUrl("javascript:x"), cleanUrl(" ")], ["https://a.tv", null, ""]);
eq("isDay", [isDay("2026-02-30"), isDay("2026-02-28"), isDay(5)], [false, true, false]);

const base = { ...blankClient("2026-01-14"), client_name: " Maria  Lopez ", plan: "Basic", frequency: "yearly" };
const v = validateClient(base);
eq("valid", v.ok && v.value.expire_date, "2027-01-14");
eq("name cleaned", v.ok && v.value.client_name, "Maria Lopez");
eq("no name", validateClient({ ...base, client_name: " " }).ok, false);
eq("no plan", validateClient({ ...base, plan: "" }).ok, false);
eq("bad mac", validateClient({ ...base, mac: "123" }).ok, false);
eq("bad portal", validateClient({ ...base, portal: "ftp://x" }).ok, false);
eq("bad donation", validateClient({ ...base, donation: "J17 <b>" }).ok, false);
eq("donation reference kept", (() => { const r = validateClient({ ...base, donation: " J17454B8498X " }); return r.ok && r.value.donation; })(), "J17454B8498X");
eq("donation empty", (() => { const r = validateClient(base); return r.ok && r.value.donation; })(), null);
eq("expiry before start", validateClient({ ...base, expire_date: "2025-01-01" }).ok, false);
eq("custom expiry", (() => { const r = validateClient({ ...base, expire_date: "2026-06-01" }); return r.ok && r.value.expire_date; })(), "2026-06-01");

eq("view whitelist", Object.keys(cleanClientView({ plan: "Basic", expire_date: "2026-11-14", mac: "00:11", history: [{ renewed_on: "2026-10-14", frequency: "monthly", expires_after: "2026-11-14", secret: 1 }] })!).sort(),
  ["date_subscribed", "expire_date", "first_name", "frequency", "history", "owner_contact", "owner_name", "plan"]);
eq("view bad", cleanClientView({ plan: "x", expire_date: "nope" }), null);
console.log(fail ? `${fail} FAILED` : "iptv: all checks passed");
process.exit(fail ? 1 : 0);
