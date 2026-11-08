// Run with: npx tsx tests/telegram-summary.test.ts
// The weekly user summary and the admin health summary: texts, data gathering and the daily job, against the fake Supabase.
import { createClient } from "@supabase/supabase-js";
import { createFakeSupabase, SERVICE_KEY } from "./e2e/fake-supabase.mjs";
import { addDaysISO } from "../src/lib/utils";
import { healthIssues, healthText, summaryIsEmpty, summaryWeek, userSummaryText, type HealthStats, type UserSummary } from "../src/lib/telegram-summary";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const yes = (c: unknown, m: string) => eq(!!c, true, m);

process.env.TELEGRAM_BOT_TOKEN = "123:TEST";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const sent: { chat: number; text: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("api.telegram.org/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    sent.push({ chat: body.chat_id, text: body.text });
    return Response.json({ ok: true, result: {} });
  }
  return realFetch(input, init);
}) as typeof fetch;

const monday = "2026-11-09";
eq(summaryWeek(monday), monday, "Monday is the summary day");
eq(summaryWeek("2026-11-10"), monday, "Tuesday is a second chance, same weekly key");
eq(summaryWeek("2026-11-11"), null, "other days: nothing");
eq(summaryWeek("2026-11-08"), null, "Sunday: nothing");

const empty: UserSummary = { today: monday, inProgress: [], upcoming: [], thisMonth: { label: "November", business: 0, personal: 0 }, lastMonth: { label: "October", business: 0, personal: 0 }, groceries: [], documents: [] };
yes(summaryIsEmpty(empty), "nothing at all: nothing to send");
const full: UserSummary = {
  ...empty,
  inProgress: [{ name: "Now <Trip>", destination: null, start_date: addDaysISO(monday, -1), end_date: addDaysISO(monday, 2), personal: false }],
  upcoming: [{ name: "Beach", destination: "Punta Cana", start_date: addDaysISO(monday, 10), end_date: addDaysISO(monday, 15), personal: true }, { name: "Miami", destination: "Miami", start_date: addDaysISO(monday, 1), end_date: null, personal: false }],
  thisMonth: { label: "November", business: 1234.5, personal: 80 }, lastMonth: { label: "October", business: 10, personal: 0 },
  groceries: [{ currency: "AWG", total: 200 }], documents: [{ title: "Passport", kind: "passport", days: 100 }],
};
const text = userSummaryText(full);
yes(!summaryIsEmpty(full), "something to report");
yes(text.includes("Now &lt;Trip&gt;") && text.includes("Happening now"), "in-progress trip, escaped");
yes(text.includes("🌴 Beach (personal)") && text.includes("✈️ Miami") && text.includes("tomorrow") && text.includes("in 10 days"), "business and personal upcoming trips with when");
yes(text.includes("November: $1,234.50 business · $80.00 personal") && text.includes("October: $10.00 business"), "this month and last month spending");
yes(text.includes("Groceries in November") && text.includes("Passport"), "groceries and documents");
yes(userSummaryText(empty).includes("No trips planned"), "says when there are no trips");

const okHealth: HealthStats = { today: monday, database: { ok: true, ms: 12 }, config: [{ name: "CRON_SECRET", ok: true }], bot: { configured: true, enabled: true }, security: { critical: 0, warning: 2, total: 5 }, newPeople: 1, totalPeople: 9, openSupport: 0, sharingOff: false, messagesSent: 7 };
eq(healthIssues(okHealth), [], "healthy app has no issues");
yes(healthText(okHealth).includes("Everything looks good") && healthText(okHealth).includes("ok (12 ms)") && healthText(okHealth).includes("9 people in total"), "healthy text");
const bad = { ...okHealth, database: { ok: false, ms: 5000 }, bot: { configured: true, enabled: false }, config: [{ name: "GEMINI_API_KEY", ok: false }], security: { critical: 2, warning: 0, total: 2 }, sharingOff: true, openSupport: null };
eq(healthIssues(bad).length, 5, "five problems found");
yes(healthText(bad).includes("5 things need attention") && healthText(bad).includes("Open support requests: unknown"), "problem text");

async function main() {
  const { runUserSummaries } = await import("../src/lib/telegram-summary");
  const { runAdminHealth, gatherUserSummary } = await import("../src/lib/telegram-summary");
  const fake = createFakeSupabase();
  for (const t of ["profiles", "trips", "personal_projects", "expenses", "personal_expenses", "grocery_receipts", "travel_documents", "telegram_notify_prefs", "telegram_sent_log", "support_requests", "security_events", "app_settings"]) fake.table(t);
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", NOLINK = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const now = new Date("2026-11-09T13:00:00Z"); // 09:00 in Aruba
  fake.table("profiles").push(
    { id: A, role: "user", telegram_id: 111, created_at: "2026-10-01T00:00:00Z" }, { id: B, role: "user", telegram_id: 222, created_at: "2026-10-01T00:00:00Z" },
    { id: C, role: "user", telegram_id: 333, created_at: "2026-10-01T00:00:00Z" }, { id: NOLINK, role: "user", telegram_id: null, created_at: "2026-10-01T00:00:00Z" },
    { id: ADMIN, role: "admin", telegram_id: 999, created_at: "2026-11-09T05:00:00Z" });
  fake.table("telegram_notify_prefs").push({ user_id: B, enabled: true, trip_reminders: false, admin_alerts: true, quiet_start: 0, quiet_end: 0, tz: "America/Aruba" });
  fake.table("trips").push(
    { id: "t1", user_id: A, name: "Miami", destination: "Miami", start_date: addDaysISO(monday, 6), end_date: addDaysISO(monday, 9), status: "active" },
    { id: "t2", user_id: A, name: "Far", destination: null, start_date: addDaysISO(monday, 90), end_date: null, status: "active" },
    { id: "t3", user_id: A, name: "Finished", destination: null, start_date: addDaysISO(monday, -20), end_date: addDaysISO(monday, -15), status: "active" },
    { id: "t4", user_id: B, name: "BSecret", destination: null, start_date: addDaysISO(monday, 3), end_date: null, status: "active" });
  fake.table("personal_projects").push({ id: "p1", user_id: A, kind: "personal_trip", name: "Beach", destination: "Punta Cana", start_date: addDaysISO(monday, 20), end_date: addDaysISO(monday, 25), status: "active" }, { id: "p2", user_id: A, kind: "home_project", name: "Kitchen", destination: null, start_date: addDaysISO(monday, 2), end_date: null, status: "active" });
  fake.table("expenses").push(
    { id: "e1", user_id: A, amount_usd: 100, expense_date: "2026-11-02" }, { id: "e2", user_id: A, amount_usd: 50.25, expense_date: "2026-11-08" },
    { id: "e3", user_id: A, amount_usd: 70, expense_date: "2026-10-20" }, { id: "e4", user_id: A, amount_usd: 999, expense_date: "2026-09-30" }, { id: "e5", user_id: B, amount_usd: 5000, expense_date: "2026-11-03" });
  fake.table("personal_expenses").push({ id: "q1", user_id: A, amount_usd: 20, expense_date: "2026-11-05" });
  fake.table("grocery_receipts").push({ id: "g1", user_id: A, total: 120, currency: "AWG", purchase_date: "2026-11-06" }, { id: "g2", user_id: A, total: 80, currency: "AWG", purchase_date: "2026-11-07" }, { id: "g3", user_id: A, total: 55, currency: "AWG", purchase_date: "2026-10-30" });
  fake.table("travel_documents").push({ id: "d1", user_id: A, kind: "passport", title: "A Passport", expiry_date: addDaysISO(monday, 100), trip_id: null }, { id: "d2", user_id: A, kind: "visa", title: "Far Visa", expiry_date: addDaysISO(monday, 200), trip_id: null });
  fake.table("support_requests").push({ id: "s1", status: "new" });
  fake.table("security_events").push({ id: "x1", severity: "critical", created_at: "2026-11-09T10:00:00Z" }, { id: "x2", severity: "warning", created_at: "2026-11-09T11:00:00Z" }, { id: "x3", severity: "info", created_at: "2026-11-01T11:00:00Z" });
  fake.table("app_settings").push({ id: 1, sharing_disabled: false });
  await fake.listen(3197);
  const db = createClient("http://127.0.0.1:3197", SERVICE_KEY, { auth: { persistSession: false } });

  const s = await gatherUserSummary(db, monday, A);
  eq(s.upcoming.map((t) => `${t.name}:${t.personal}`), ["Miami:false", "Beach:true"], "A: business and personal trips in the next 30 days, in date order (far, finished, home projects and others' trips left out)");
  eq(s.inProgress, [], "A: nothing in progress");
  eq([s.thisMonth.business, s.thisMonth.personal, s.lastMonth.business], [150.25, 20, 70], "A: this month and last month totals (older months left out, B's spending never mixed in)");
  eq(s.groceries, [{ currency: "AWG", total: 200 }], "A: groceries this month only");
  eq(s.documents.map((d) => d.title), ["A Passport"], "A: a passport inside 6 months is listed; the far visa is not");
  eq((await gatherUserSummary(db, monday, NOLINK)).upcoming, [], "a person with nothing gets nothing");

  const r = await runUserSummaries(db, monday, now);
  // (the fake database ignores the "has Telegram" filter, so the unlinked person is counted and skipped here)
  eq(r, { checked: 5, sent: 1, skipped: 4 }, "only A is sent one (B has reminders off, C and the admin have nothing to report, the unlinked person has no chat)");
  eq(sent.map((m) => m.chat), [111], "...to A's chat");
  yes(sent[0].text.includes("Miami") && sent[0].text.includes("Beach") && !sent[0].text.includes("BSecret") && sent[0].text.includes("$150.25"), "A's text has only A's data");
  eq((await runUserSummaries(db, monday, now)).sent, 0, "once a week");
  eq((await runUserSummaries(db, "2026-11-10", now)).sent, 0, "...also not again on Tuesday");
  eq((await runUserSummaries(db, "2026-11-11", now)).checked, 0, "Wednesday: the job does nothing");

  // quiet hours hold it back; Tuesday sends it
  fake.table("telegram_sent_log").length = 0; sent.length = 0;
  fake.table("telegram_notify_prefs").push({ user_id: A, enabled: true, trip_reminders: true, admin_alerts: true, quiet_start: 22, quiet_end: 7, tz: "America/Aruba" });
  eq((await runUserSummaries(db, monday, new Date("2026-11-09T05:00:00Z"))).sent, 0, "quiet hours hold the summary on Monday");
  eq((await runUserSummaries(db, "2026-11-10", new Date("2026-11-10T13:00:00Z"))).sent, 1, "...and it goes out on Tuesday");

  // admin health
  sent.length = 0;
  const env = { CRON_SECRET: "x", GEMINI_API_KEY: "y" };
  eq(await runAdminHealth(db, monday, { env, bot: { configured: true, enabled: true }, now }), 1, "the one linked admin gets the health summary");
  const h = sent[0].text;
  yes(sent[0].chat === 999 && h.includes("App health"), "...in their chat");
  yes(h.includes("2 events (1 critical, 1 warning)"), "24h security events counted by severity (the old one is left out)");
  yes(h.includes("New sign-ups, last 24h: 1 (5 people in total)"), "sign-ups counted (only the admin joined in the last day)");
  yes(h.includes("Open support requests: 1") && h.includes("Sharing: on") && h.includes("RESEND_API_KEY (support email) is not set"), "support, sharing and missing settings shown");
  yes(h.includes("1 critical security event"), "a critical event is flagged as needing attention");
  eq(await runAdminHealth(db, monday, { env, bot: { configured: true, enabled: true }, now }), 0, "health goes once a day");
  eq(await runAdminHealth(db, addDaysISO(monday, 1), { env, bot: { configured: true, enabled: true }, now }), 1, "...and again the next day");

  await fake.close();
  globalThis.fetch = realFetch;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
