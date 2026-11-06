// Run with: npx tsx tests/telegram-reminders.test.ts
// Reminder and digest texts, plus the daily job against the in-memory fake Supabase (Telegram stubbed).
import { createClient } from "@supabase/supabase-js";
import { createFakeSupabase, SERVICE_KEY } from "./e2e/fake-supabase.mjs";
import { addDaysISO } from "../src/lib/utils";
import { digestText, documentReminderText, documentTier, reminderText, reminderTier } from "../src/lib/telegram-reminders";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const yes = (c: unknown, m: string) => eq(!!c, true, m);

process.env.TELEGRAM_BOT_TOKEN = "123:TEST";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const sent: { chat: number; text: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("api.telegram.org/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    sent.push({ chat: body.chat_id, text: body.text });
    return Response.json({ ok: true, result: {} });
  }
  return realFetch(input, init);
}) as typeof fetch;

const today = "2026-11-05";
const trip = (s: string) => ({ id: "t", user_id: "u", name: "Miami <Conf>", destination: "Miami", start_date: s, end_date: addDaysISO(s, 3) });

eq(reminderTier(trip(addDaysISO(today, 7)), today), { tier: 7, days: 7 }, "7 days out is the week reminder");
eq(reminderTier(trip(addDaysISO(today, 6)), today), { tier: 7, days: 6 }, "6 days out is a second chance for it");
eq(reminderTier(trip(addDaysISO(today, 1)), today), { tier: 1, days: 1 }, "1 day out is the day-before reminder");
eq(reminderTier(trip(today), today), { tier: 1, days: 0 }, "the start day is a second chance for it");
eq(reminderTier(trip(addDaysISO(today, 3)), today), null, "3 days out gets nothing");
eq(reminderTier(trip(addDaysISO(today, 8)), today), null, "8 days out gets nothing");
eq(reminderTier(trip(addDaysISO(today, -1)), today), null, "a started trip gets nothing");
yes(reminderText(trip(today), 0).includes("starts today"), "text says today");
yes(reminderText(trip(addDaysISO(today, 1)), 1).includes("starts tomorrow"), "text says tomorrow");
yes(reminderText(trip(addDaysISO(today, 7)), 7).includes("in 7 days"), "text says in 7 days");
yes(reminderText(trip(addDaysISO(today, 7)), 7).includes("Miami &lt;Conf&gt;"), "trip name is escaped");
yes(reminderText({ ...trip(addDaysISO(today, 7)), personal: true }, 7).includes("(personal)"), "personal travel is labelled");
yes(!reminderText(trip(addDaysISO(today, 7)), 7).includes("(personal)"), "business trips are not");

const dtier = (kind: string, d: number) => documentTier({ kind, expiry_date: addDaysISO(today, d) }, today);
eq(dtier("passport", 300), null, "passport far from expiry: nothing");
eq(dtier("passport", 250), { tier: "soon", days: 250 }, "passport inside 9 months: first reminder");
eq(dtier("passport", 170), { tier: "urgent", days: 170 }, "passport inside 6 months: urgent");
eq(dtier("visa", 90), null, "visa 90 days out: nothing");
eq(dtier("visa", 45), { tier: "soon", days: 45 }, "visa inside 60 days: reminder");
eq(dtier("id", 10), { tier: "urgent", days: 10 }, "ID inside 14 days: urgent");
eq(dtier("id", 0), { tier: "urgent", days: 0 }, "expires today: urgent");
eq(dtier("id", -5), { tier: "expired", days: -5 }, "just expired: told once");
eq(dtier("id", -45), null, "long expired: not announced");
yes(documentReminderText({ id: "1", user_id: "u", kind: "passport", title: "Dutch <Passport>", expiry_date: addDaysISO(today, 170) }, 170).includes("Dutch &lt;Passport&gt;"), "document name is escaped");
yes(documentReminderText({ id: "1", user_id: "u", kind: "passport", title: "P", expiry_date: addDaysISO(today, 170) }, 170).includes("6+ months"), "passport text mentions the 6-month rule");
yes(documentReminderText({ id: "1", user_id: "u", kind: "visa", title: "ESTA", expiry_date: addDaysISO(today, -3) }, -3).includes("expired 3 days ago"), "expired text");

const stats = { today, newExpenses: 1, newPeople: 0, openSupport: null, startingSoon: [], activeTrips: 2 };
yes(digestText(stats).includes("1 expense added"), "digest uses singular");
yes(!digestText(stats).includes("support"), "digest hides support when unknown");
yes(!digestText(stats).includes("Starting this week"), "digest hides empty list");
yes(digestText({ ...stats, openSupport: 3, startingSoon: Array.from({ length: 7 }, (_, i) => ({ name: `T${i}`, start_date: addDaysISO(today, 2) })) }).includes("and 2 more"), "digest trims long list");

async function main() {
  const { runAdminDigest, runTripReminders } = await import("../src/lib/telegram-reminders");
  const fake = createFakeSupabase();
  for (const t of ["profiles", "trips", "expenses", "telegram_notify_prefs", "telegram_sent_log", "support_requests", "personal_projects", "travel_documents"]) fake.table(t);
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", NOLINK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", ADMIN2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  fake.table("profiles").push(
    { id: A, role: "user", full_name: "A", telegram_id: 111, created_at: "2026-11-03T12:00:00.000Z" },
    { id: B, role: "user", full_name: "B", telegram_id: 222, created_at: "2026-11-03T12:00:00.000Z" },
    { id: ADMIN, role: "admin", full_name: "Boss", telegram_id: 999, created_at: "2026-11-03T12:00:00.000Z" },
    { id: ADMIN2, role: "admin", full_name: "Boss2", telegram_id: 888, created_at: "2026-11-03T12:00:00.000Z" },
    { id: NOLINK, role: "user", full_name: "N", telegram_id: null, created_at: "2026-11-04T15:00:00.000Z" }
  );
  const mk = (id: string, user: string, name: string, s: number) => ({ id, user_id: user, name, destination: "X", start_date: addDaysISO(today, s), end_date: addDaysISO(today, s + 2), currency: "USD", status: "active" });
  fake.table("trips").push(mk("t7", A, "Seven", 7), mk("t1", B, "One", 1), mk("t3", A, "Three", 3), mk("t7n", NOLINK, "NoTelegram", 7), mk("a1", ADMIN, "AdminSeven", 5), mk("a2", ADMIN, "AdminNow", -1), mk("b1", ADMIN2, "OtherAdminTrip", 5), { ...mk("t7d", B, "Done", 7), status: "completed" });
  fake.table("telegram_notify_prefs").push({ user_id: B, enabled: true, trip_reminders: false, admin_alerts: true, quiet_start: 22, quiet_end: 7, tz: "America/Aruba" });
  fake.table("expenses").push(
    { id: "e1", user_id: A, trip_id: "t7", created_at: "2026-11-04T10:00:00.000Z" },
    { id: "e2", user_id: A, trip_id: "t7", created_at: "2026-11-04T20:00:00.000Z" },
    { id: "e4", user_id: ADMIN, trip_id: "a2", created_at: "2026-11-04T12:00:00.000Z" },
    { id: "e5", user_id: ADMIN2, trip_id: "b1", created_at: "2026-11-04T12:00:00.000Z" },
    { id: "e6", user_id: ADMIN2, trip_id: "b1", created_at: "2026-11-04T13:00:00.000Z" },
    { id: "e3", user_id: B, trip_id: "t1", created_at: "2026-11-03T20:00:00.000Z" }
  );
  fake.table("support_requests").push({ id: "s1", status: "new" }, { id: "s2", status: "resolved" });
  await fake.listen(3198);
  const db = createClient("http://127.0.0.1:3198", SERVICE_KEY, { auth: { persistSession: false } });
  const noon = new Date("2026-11-05T13:00:00Z"); // 09:00 in Aruba

  const r = await runTripReminders(db, today, noon);
  eq(r, { checked: 3, sent: 1, skipped: 2 }, "only the person with a 7-day trip is messaged");
  eq(sent.map((s) => s.chat), [111], "reminder went to the right chat");
  yes(sent[0].text.includes("Seven") && sent[0].text.includes("in 7 days"), "reminder text is for that trip");
  const again = await runTripReminders(db, today, noon);
  eq(again.sent, 0, "running again sends nothing (once only)");
  eq(sent.length, 1, "no second message");

  const night = new Date("2026-11-05T05:00:00Z"); // 01:00 in Aruba
  fake.table("telegram_sent_log").length = 0;
  const q = await runTripReminders(db, today, night);
  eq(q.sent, 0, "quiet hours hold the reminder");
  const later = await runTripReminders(db, today, noon);
  eq(later.sent, 1, "...and it still goes once quiet hours end");

  // A reminder held back today is sent tomorrow (6 days out) and not again after that
  fake.table("telegram_sent_log").length = 0;
  const nextDay = addDaysISO(today, 1);
  const missed = await runTripReminders(db, nextDay, night);
  eq(missed.sent, 0, "held back again at night");
  const retry = await runTripReminders(db, nextDay, noon);
  eq(retry.sent, 1, "next day the week reminder goes out (6 days out; the other traveller has reminders off)");
  const third = await runTripReminders(db, addDaysISO(today, 2), noon);
  eq(third.sent, 1, "two days on only the other trip (now 1 day out) is reminded");
  eq((await runTripReminders(db, addDaysISO(today, 3), noon)).sent, 0, "nothing repeats");

  // Documents nearing expiry
  const { runDocumentReminders } = await import("../src/lib/telegram-reminders");
  const doc = (id: string, user: string, kind: string, title: string, d: number, trip: string | null = null) => ({ id, user_id: user, kind, title, expiry_date: addDaysISO(today, d), trip_id: trip });
  fake.table("travel_documents").push(doc("x1", A, "passport", "A Passport", 170), doc("x2", A, "visa", "Far Visa", 200), doc("x3", B, "id", "B ID", 5), doc("x4", A, "insurance", "Trip Insurance", 5, "t7"), doc("x5", NOLINK, "id", "No Telegram", 5), doc("x6", A, "id", "Ancient", -90));
  sent.length = 0;
  const dr = await runDocumentReminders(db, today, noon);
  eq(dr.sent, 1, "only A's passport is reminded (B has reminders off; trip, unlinked, far and ancient documents are skipped)");
  yes(sent[0].chat === 111 && sent[0].text.includes("A Passport"), "document reminder goes to the owner");
  eq((await runDocumentReminders(db, today, noon)).sent, 0, "...once per step");
  eq((await runDocumentReminders(db, addDaysISO(today, 1), noon)).sent, 0, "...and not again the next day");
  fake.table("travel_documents").find((d: { id: string }) => d.id === "x1")!.expiry_date = addDaysISO(today, 100);
  eq((await runDocumentReminders(db, today, noon)).sent, 1, "a renewed (new) expiry date can be reminded again");

  // Personal travel is reminded too (and a home project or a finished trip is not)
  const later10 = addDaysISO(today, 10);
  fake.table("personal_projects").push(
    { id: "p1", user_id: A, kind: "personal_trip", name: "Beach Week", destination: "Punta Cana", start_date: addDaysISO(later10, 7), end_date: addDaysISO(later10, 12), status: "active" },
    { id: "p2", user_id: A, kind: "home_project", name: "Kitchen", destination: null, start_date: addDaysISO(later10, 7), end_date: null, status: "active" },
    { id: "p3", user_id: A, kind: "personal_trip", name: "Old Trip", destination: null, start_date: addDaysISO(later10, 7), end_date: null, status: "completed" }
  );
  sent.length = 0;
  eq((await runTripReminders(db, later10, noon)).sent, 1, "a personal trip a week out is reminded");
  yes(sent[0].text.includes("Beach Week") && sent[0].text.includes("(personal)"), "...as personal travel");
  eq((await runTripReminders(db, later10, noon)).sent, 0, "...once only");

  sent.length = 0;
  eq(await runAdminDigest(db, today), 2, "each linked admin gets a summary");
  const toBoss = sent.find((m) => m.chat === 999)!.text, toBoss2 = sent.find((m) => m.chat === 888)!.text;
  yes(toBoss !== toBoss2, "two admins never get the same summary");
  yes(toBoss.includes("1 expense added") && toBoss.includes("AdminSeven"), "admin one sees only their own expense and trip");
  yes(!toBoss.includes("OtherAdminTrip") && !toBoss.includes("Three"), "...and nobody else's trips");
  yes(toBoss2.includes("2 expenses added") && toBoss2.includes("OtherAdminTrip") && !toBoss2.includes("AdminSeven"), "admin two sees only their own");
  yes(toBoss.includes("New sign-ups: 1") && toBoss.includes("Open support requests: 1"), "admin duties (sign-ups, support) are shown");
  eq(await runAdminDigest(db, today), 0, "digest goes once a day");

  await fake.close();
  globalThis.fetch = realFetch;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
