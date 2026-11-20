import { airlineName, buildAnswers, cleanDetails, entryReminderDue, entryStatus, homeFlight, isConfirmationPaper, missingDetails, shortDate, EMPTY_DETAILS } from "../src/lib/entry-card";
import { normalizePushSettings } from "../src/lib/push-prefs";
import { pushMessage } from "../src/lib/push-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

const d = cleanDetails({ last_name: " Sabo ", first_name: "Pat", passport_number: "ab 12 34", nationality: "Aruban", birth_date: "1984-06-12", gender: "Male", birth_country: "Aruba", email: " Pat@Example.com " });
eq(d.passport_number, "AB1234", "passport number: capitals, no spaces");
eq(d.email, "pat@example.com", "email trimmed and lower case");
eq(cleanDetails({ birth_date: "12/06/1984", gender: "x" }).birth_date + cleanDetails({ gender: "x" }).gender, "", "bad date and gender are dropped");
eq(missingDetails(EMPTY_DETAILS, null).length, 9, "everything missing at first (8 details and the passport expiry)");
eq(missingDetails(d, "2031-03-14"), [], "nothing missing when complete");
eq(missingDetails({ ...d, email: "nope" }, "2031-03-14"), ["email address"], "a bad email counts as missing");
eq(shortDate("2026-11-24"), "24 Nov 2026", "date in the card's order");

const f = (o: object) => ({ flight_number: "CM 348", airline: "Copa", flight_date: "2026-11-24", dep_iata: "PTY", dep_city: "Panama City", dep_local: "2026-11-24T09:40", arr_iata: "AUA", status: "scheduled", ...o });
eq(homeFlight([f({ arr_iata: "PTY", flight_date: "2026-11-18" }), f({})])?.flight_number, "CM 348", "the flight landing in Aruba");
eq(homeFlight([f({ arr_iata: "PTY" })]), null, "no flight home, no card");
eq(homeFlight([f({ status: "cancelled" })]), null, "a cancelled flight does not count");
eq(airlineName("CM", null), "Copa Airlines", "airline code becomes the site's name");
eq(airlineName("ZZ", "Some Air"), "Some Air", "unknown code uses the flight's own airline name");

const a = buildAnswers(d, "2031-03-14", f({}), "2026-11-24", "Panama");
eq(a.map((s) => s.id), ["start", "passport", "arrival", "contact", "review"], "sections follow the site");
eq(a[1].rows.map((r) => r.label), ["Passport number", "Passport expiration date", "Last name(s)", "First name(s)", "Nationality", "Date of birth", "Gender", "Country of birth"], "passport rows in the site's order");
eq(a[2].rows.map((r) => r.value), ["Panama", "Air", "Copa Airlines", "348"], "arrival answers come from the flight");
eq(a[1].rows[0].secret, true, "the passport number is a secret row");
eq(a[4].manual, true, "review and submit stays with the person");
eq(buildAnswers(EMPTY_DETAILS, null, null, null, null)[1].rows.every((r) => r.missing), true, "empty details are flagged missing");

const st = (today: string, done = false, missing: string[] = []) => entryStatus({ today, flightDay: "2026-11-24", done, missing });
eq(st("2026-11-19").state, "amber", "5 days out: amber");
eq(st("2026-11-21").state, "amber", "3 days out: amber");
eq(st("2026-11-22").state, "red", "2 days out and not done: red");
eq(st("2026-11-24").state, "red", "flight day and not done: red");
eq(st("2026-11-22", true).state, "green", "done is green");
eq(st("2026-11-10", true).state, "green", "done early is green");
eq(st("2026-11-19", false, ["passport number"]).sub.startsWith("Add your details"), true, "amber says to add details");

eq(entryReminderDue("2026-11-24", "2026-11-19", false), 5, "reminder 5 days before");
eq(entryReminderDue("2026-11-24", "2026-11-22", false), 2, "reminder 2 days before");
eq(entryReminderDue("2026-11-24", "2026-11-21", false), null, "none in between");
eq(entryReminderDue("2026-11-24", "2026-11-22", true), null, "none once done");
eq(isConfirmationPaper("Aruba re-entry card confirmation"), true, "a confirmation paper counts");
eq(isConfirmationPaper("Hotel booking"), false, "other papers do not");

eq(normalizePushSettings(null).entryCard, true, "the alert is on until switched off");
eq(normalizePushSettings({ entryCard: false }).entryCard, false, "and can be switched off");
const msg = (x: object, detail: "details" | "private" = "details") => pushMessage("entryCard", x, detail).body;
eq(msg({ trip: "Panama City", days: 2 }), "Panama City: your Aruba re-entry card is not done yet. You fly in 2 days. It takes about 3 minutes.", "details wording");
eq(msg({ trip: "Panama City", days: 2 }, "private"), "Your Aruba re-entry card is not done yet. Open the app to fill it in.", "private wording");
eq(/AB1234|Sabo/.test(msg({ trip: "Panama City", days: 2 })), false, "never carries a detail");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
