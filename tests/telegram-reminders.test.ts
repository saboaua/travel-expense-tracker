// Run with: npx tsx tests/telegram-reminders.test.ts
// Reminder and digest texts, plus the daily job against the in-memory fake Supabase (Telegram stubbed).
import { createClient } from "@supabase/supabase-js";
import { createFakeSupabase, SERVICE_KEY } from "./e2e/fake-supabase.mjs";
import { addDaysISO } from "../src/lib/utils";
import { digestText, reminderDaysFor, reminderText } from "../src/lib/telegram-reminders";

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

eq(reminderDaysFor(trip(addDaysISO(today, 7)), today), 7, "7 days out gets a reminder");
eq(reminderDaysFor(trip(addDaysISO(today, 1)), today), 1, "1 day out gets a reminder");
eq(reminderDaysFor(trip(addDaysISO(today, 3)), today), null, "3 days out does not");
eq(reminderDaysFor(trip(today), today), null, "a trip starting today does not");
yes(reminderText(trip(addDaysISO(today, 1)), 1).includes("starts tomorrow"), "text says tomorrow");
yes(reminderText(trip(addDaysISO(today, 7)), 7).includes("in 7 days"), "text says in 7 days");
yes(reminderText(trip(addDaysISO(today, 7)), 7).includes("Miami &lt;Conf&gt;"), "trip name is escaped");

const stats = { today, newExpenses: 1, activePeople: 1, newPeople: 0, openSupport: null, startingSoon: [], activeTrips: 2 };
yes(digestText(stats).includes("1 expense from 1 person"), "digest uses singular");
yes(!digestText(stats).includes("support"), "digest hides support when unknown");
yes(!digestText(stats).includes("Starting this week"), "digest hides empty list");
yes(digestText({ ...stats, openSupport: 3, startingSoon: Array.from({ length: 7 }, (_, i) => ({ name: `T${i}`, start_date: addDaysISO(today, 2) })) }).includes("and 2 more"), "digest trims long list");

async function main() {
  const { runAdminDigest, runTripReminders } = await import("../src/lib/telegram-reminders");
  const fake = createFakeSupabase();
  for (const t of ["profiles", "trips", "expenses", "telegram_notify_prefs", "telegram_sent_log", "support_requests"]) fake.table(t);
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", NOLINK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  fake.table("profiles").push(
    { id: A, role: "user", full_name: "A", telegram_id: 111, created_at: "2026-11-03T12:00:00.000Z" },
    { id: B, role: "user", full_name: "B", telegram_id: 222, created_at: "2026-11-03T12:00:00.000Z" },
    { id: ADMIN, role: "admin", full_name: "Boss", telegram_id: 999, created_at: "2026-11-03T12:00:00.000Z" },
    { id: NOLINK, role: "user", full_name: "N", telegram_id: null, created_at: "2026-11-04T15:00:00.000Z" }
  );
  const mk = (id: string, user: string, name: string, s: number) => ({ id, user_id: user, name, destination: "X", start_date: addDaysISO(today, s), end_date: addDaysISO(today, s + 2), currency: "USD", status: "active" });
  fake.table("trips").push(mk("t7", A, "Seven", 7), mk("t1", B, "One", 1), mk("t3", A, "Three", 3), mk("t7n", NOLINK, "NoTelegram", 7), { ...mk("t7d", B, "Done", 7), status: "completed" });
  fake.table("telegram_notify_prefs").push({ user_id: B, enabled: true, trip_reminders: false, admin_alerts: true, quiet_start: 22, quiet_end: 7, tz: "America/Aruba" });
  fake.table("expenses").push(
    { id: "e1", user_id: A, trip_id: "t7", created_at: "2026-11-04T10:00:00.000Z" },
    { id: "e2", user_id: A, trip_id: "t7", created_at: "2026-11-04T20:00:00.000Z" },
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

  sent.length = 0;
  eq(await runAdminDigest(db, today), 1, "digest goes to the one linked admin");
  eq(sent[0].chat, 999, "digest to the admin chat");
  yes(sent[0].text.includes("2 expenses from 1 person"), "digest counts yesterday's expenses (Aruba day)");
  yes(sent[0].text.includes("New sign-ups: 1"), "digest counts new sign-ups");
  yes(sent[0].text.includes("Open support requests: 1"), "digest counts open support requests");
  yes(sent[0].text.includes("Seven") && sent[0].text.includes("Three"), "digest lists trips starting this week");
  eq(await runAdminDigest(db, today), 0, "digest goes once a day");

  await fake.close();
  globalThis.fetch = realFetch;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
