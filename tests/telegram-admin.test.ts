// Run with: npx tsx tests/telegram-admin.test.ts
// Alerts to admins and the /newuser and /role chat commands, against the in-memory fake Supabase (Telegram stubbed).
import { createClient } from "@supabase/supabase-js";
import { createFakeSupabase, SERVICE_KEY } from "./e2e/fake-supabase.mjs";
import { alertForAudit, alertForSecurityEvent, supportAlert } from "../src/lib/telegram-alerts";
import { parseNewUser, parseRole } from "../src/lib/telegram-admin";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const yes = (c: unknown, m: string) => eq(!!c, true, m);

process.env.TELEGRAM_BOT_TOKEN = "123:TEST";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const sent: { chat: number; text: string; markup?: { inline_keyboard: { callback_data: string }[][] } }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("api.telegram.org/")) {
    if (url.endsWith("/sendMessage")) { const b = JSON.parse(String(init?.body ?? "{}")); sent.push({ chat: b.chat_id, text: b.text, markup: b.reply_markup }); }
    return Response.json({ ok: true, result: {} });
  }
  return realFetch(input, init);
}) as typeof fetch;

const now = new Date("2026-11-05T15:00:00Z");
// pure alert rules
eq(alertForSecurityEvent({ eventType: "login_success", severity: "info" }), null, "routine event: no alert");
eq(alertForSecurityEvent({ eventType: "suspicious_input", severity: "warning" }), null, "warning noise: no alert");
yes(alertForSecurityEvent({ eventType: "login_blocked", severity: "warning", emailAttempted: "a@b.com" }, now)?.text.includes("a@b.com"), "blocked sign-in alerts and names the account");
eq(alertForSecurityEvent({ eventType: "protection_degraded", severity: "warning" }, now)?.dedupeKey, "sec:protection_degraded:2026-11-05T15", "one alert per type per hour");
eq(alertForSecurityEvent({ eventType: "anything", severity: "critical" }, now)?.urgent, true, "critical is urgent");
yes(alertForSecurityEvent({ eventType: "login_blocked", emailAttempted: "<b>x</b>" }, now)?.text.includes("&lt;b&gt;"), "account text is escaped");
eq(alertForAudit({ action: "user.login" }), null, "unrelated audit action: no alert");
yes(alertForAudit({ action: "user.role_changed", actorEmail: "boss@x.com", details: { email: "j@x.com", from: "user", to: "assistant" } })?.text.includes("user → assistant"), "role change alert");
yes(supportAlert("Ann <x>", "Help", "id1").text.includes("Ann &lt;x&gt;"), "support alert escapes the name");

// command parsing
eq(parseNewUser(["Jane@X.com", "role:assistant", "Jane", "Van", "Dam"]), { ok: true, value: { email: "jane@x.com", role: "assistant", firstName: "Jane", lastName: "Van Dam" } }, "newuser with role and name");
eq(parseNewUser(["jane@x.com"]), { ok: true, value: { email: "jane@x.com", role: "user", firstName: null, lastName: null } }, "newuser email only");
eq(parseNewUser(["jane@x.com", "role:admin"]).ok, false, "no admin from the chat");
eq(parseNewUser(["nope"]).ok, false, "bad email refused");
eq(parseNewUser([]).ok, false, "missing email refused");
eq(parseRole(["a@x.com", "assistant"]).ok, true, "role command parsed");
eq(parseRole(["a@x.com", "admin"]).ok, false, "no admin role from the chat");
eq(parseRole(["a@x.com"]).ok, false, "role needs a role name");

async function main() {
  const { handleCallback, handleMessage } = await import("../src/lib/telegram-bot");
  const { notifySecurityEvent } = await import("../src/lib/telegram-alerts");
  const fake = createFakeSupabase();
  for (const t of ["profiles", "roles", "telegram_notify_prefs", "telegram_sent_log", "telegram_admin_actions", "audit_logs"]) fake.table(t);
  const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ADMIN2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", OTHERADMIN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  fake.table("profiles").push(
    { id: ADMIN, role: "admin", email: "boss@x.com", full_name: "Boss", telegram_id: 100 },
    { id: ADMIN2, role: "admin", email: "boss2@x.com", full_name: "Boss2", telegram_id: 200 },
    { id: USER, role: "user", email: "pat@x.com", full_name: "Pat", telegram_id: 300 },
    { id: OTHERADMIN, role: "admin", email: "root@x.com", full_name: "Root", telegram_id: null }
  );
  // these tests are not about quiet hours (22:00 to 07:00 Aruba), so nobody has any: they pass at any time of day
  for (const id of [ADMIN, ADMIN2, USER]) fake.table("telegram_notify_prefs").push({ user_id: id, enabled: true, trip_reminders: true, admin_alerts: true, quiet_start: 0, quiet_end: 0, tz: "America/Aruba" });
  fake.table("roles").push({ key: "assistant", label: "Assistant", permissions: [], known_features: [], is_system: true });
  await fake.listen(3197);
  const db = createClient("http://127.0.0.1:3197", SERVICE_KEY, { auth: { persistSession: false } });
  const msg = (from: number, text: string, type = "private") => ({ chat: { id: from, type }, from: { id: from }, text });
  const tap = (from: number, data: string, type = "private") => handleCallback(db, { id: "cb", data, from: { id: from }, message: { chat: { id: from, type } } });
  const last = () => sent.at(-1)!;

  // alerts reach admins who linked Telegram, once per hour
  await notifySecurityEvent(db, { eventType: "login_blocked", severity: "warning", emailAttempted: "x@y.com" });
  eq(sent.map((s) => s.chat).sort(), [100, 200], "alert goes to the linked admins only");
  sent.length = 0;
  await notifySecurityEvent(db, { eventType: "login_blocked", severity: "warning", emailAttempted: "x@y.com" });
  eq(sent.length, 0, "same alert in the same hour is not repeated");

  // non-admins and groups are refused
  sent.length = 0;
  await handleMessage(db, msg(300, "/newuser a@b.com"));
  yes(last().text.includes("for admins"), "a regular user cannot use /newuser");
  await handleMessage(db, msg(100, "/newuser a@b.com", "group"));
  yes(last().text.includes("private chat"), "admin actions refuse group chats");
  eq(fake.table("telegram_admin_actions").length, 0, "nothing stored for refused requests");

  // /newuser: asks first, creates only after Confirm
  await handleMessage(db, msg(100, "/newuser New@Person.com role:assistant Nina Park"));
  yes(last().text.includes("Create this account?") && last().text.includes("new@person.com"), "newuser asks to confirm");
  const confirmData = last().markup!.inline_keyboard[0][0].callback_data;
  eq(fake.table("profiles").length, 4, "no account before confirming");
  await tap(200, confirmData);
  yes(last().text.includes("could not find"), "another admin cannot confirm someone else's request");
  eq(fake.table("profiles").length, 4, "...and nothing was created");
  sent.length = 0;
  await tap(100, confirmData);
  const made = fake.table("profiles").find((p: { email: string }) => p.email === "new@person.com");
  yes(made, "Confirm creates the profile");
  eq(made?.role, "assistant", "...with the chosen role");
  eq(made?.must_change_password, true, "...forced to change the password");
  const toAdmin = sent.find((s) => s.chat === 100)!;
  yes(/Temporary password: <code>[A-Za-z0-9]{14}<\/code>/.test(toAdmin.text), "admin gets the temporary password");
  yes(sent.some((s) => s.chat === 200 && s.text.includes("created the account")), "the other admin is told");
  yes(!sent.some((s) => s.chat === 100 && s.text.includes("created the account")), "the actor is not alerted about their own action");
  eq(fake.table("audit_logs").at(-1)?.action, "user.created", "audit row written");
  eq(fake.table("audit_logs").at(-1)?.details.via, "telegram", "...marked as from Telegram");
  sent.length = 0;
  await tap(100, confirmData);
  yes(last().text.includes("already handled"), "a second tap does nothing");
  eq(fake.table("profiles").length, 5, "...no duplicate account");

  // duplicates, cancel, unknown role
  await handleMessage(db, msg(100, "/newuser pat@x.com"));
  yes(last().text.includes("already has an account"), "existing email refused");
  await handleMessage(db, msg(100, "/newuser z@z.com role:nothing"));
  yes(last().text.includes("does not exist"), "unknown role refused");
  await handleMessage(db, msg(100, "/newuser c@c.com"));
  await tap(100, last().markup!.inline_keyboard[0][1].callback_data);
  yes(last().text.includes("Cancelled"), "Cancel stops it");
  eq(fake.table("profiles").some((p: { email: string }) => p.email === "c@c.com"), false, "...and nothing is created");

  // /role
  await handleMessage(db, msg(100, "/role pat@x.com assistant"));
  yes(last().text.includes("user → <b>assistant</b>"), "role asks to confirm");
  await tap(100, last().markup!.inline_keyboard[0][0].callback_data);
  eq(fake.table("profiles").find((p: { id: string }) => p.id === USER).role, "assistant", "Confirm changes the role");
  eq(fake.table("audit_logs").at(-1)?.action, "user.role_changed", "role change audited");
  await handleMessage(db, msg(100, "/role boss2@x.com assistant"));
  yes(last().text.includes("is an admin"), "admins cannot be changed from the chat");
  await handleMessage(db, msg(100, "/role boss@x.com assistant"));
  yes(last().text.includes("own role"), "cannot change your own role");
  await handleMessage(db, msg(100, "/role ghost@x.com assistant"));
  yes(last().text.includes("No account"), "unknown account");

  // expired request
  await handleMessage(db, msg(100, "/newuser late@x.com"));
  const row = fake.table("telegram_admin_actions").at(-1);
  row.expires_at = new Date(Date.now() - 1000).toISOString();
  await tap(100, last().markup!.inline_keyboard[0][0].callback_data);
  yes(last().text.includes("expired"), "old request expired");
  eq(fake.table("profiles").some((p: { email: string }) => p.email === "late@x.com"), false, "...nothing created");

  await fake.close();
  globalThis.fetch = realFetch;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
