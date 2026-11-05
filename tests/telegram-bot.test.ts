// Run with: npx tsx tests/telegram-bot.test.ts
// Drives the real bot code against the in-memory fake Supabase, with Telegram and the AI reader stubbed.
import { createClient } from "@supabase/supabase-js";
import { createFakeSupabase, SERVICE_KEY } from "./e2e/fake-supabase.mjs";
import { addDaysISO, todayISO } from "../src/lib/utils";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const yes = (c: unknown, m: string) => eq(!!c, true, m);

process.env.TELEGRAM_BOT_TOKEN = "123:TEST";
process.env.ANTHROPIC_API_KEY = "test-key";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const sent: { method: string; body: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("api.telegram.org/file/")) return new Response(JPEG, { status: 200 });
  if (url.includes("api.telegram.org/")) {
    const method = url.split("/").pop() as string;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sent.push({ method, body });
    return Response.json({ ok: true, result: method === "getFile" ? { file_path: "photos/file_1.jpg" } : {} });
  }
  if (url.includes("api.anthropic.com")) {
    const prompt = JSON.stringify(JSON.parse(String(init?.body)).messages);
    const out = /grocery store receipt/.test(prompt)
      ? { store: "Super Food", date: "2026-11-04", total: 12.5, currency: "AWG", items: [{ name: "Milk", quantity: 1, unit_price: 5, line_total: 5, category: "Dairy & Eggs" }, { name: "Bread", quantity: 1, unit_price: 7.5, line_total: 7.5, category: "Bakery" }] }
      : /travel document/.test(prompt)
        ? { kind: "visa", issuing_country: "Aruba", document_number: "AB123456", expiry_date: "2028-01-31", holder_name: "Pat" }
        : { merchant: "Cafe Uno", amount: 18.4, date: "2026-11-04", currency: "USD", category: "Meals" };
    return Response.json({ content: [{ type: "text", text: JSON.stringify(out) }] });
  }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
const { handleCallback, handleMessage } = await import("../src/lib/telegram-bot");

const fake = createFakeSupabase();
const FEATURES = ["trips", "reports", "personal", "personal.dashboard", "documents"];
fake.seed("roles", [{ key: "user", label: "User", permissions: FEATURES, known_features: FEATURES, is_system: true }]);
fake.seed("app_settings", [{ id: 1, personal_enabled: true }]);
fake.seed("currencies", [{ code: "USD", usd_rate: 1, enabled: true, sort_order: 1 }, { code: "AWG", usd_rate: 0.558659, enabled: true, sort_order: 2 }]);
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TRIP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_TRIP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROJECT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const today = todayISO();
for (const t of ["profiles", "trips", "expenses", "personal_projects", "personal_expenses", "grocery_receipts", "grocery_items", "travel_documents", "telegram_pending", "telegram_notify_prefs", "categories", "grocery_categories", "telegram_updates"]) fake.table(t);
fake.table("profiles").push({ id: USER, role: "user", full_name: "Pat", telegram_id: 777, telegram_default_trip_id: null }, { id: OTHER, role: "user", full_name: "Other", telegram_id: 888, telegram_default_trip_id: null });
const tripRow = (id: string, user: string, name: string, s: number, e: number) => ({ id, user_id: user, name, destination: "Miami", start_date: addDaysISO(today, s), end_date: addDaysISO(today, e), currency: "USD", status: "active" });
fake.table("trips").push(tripRow(TRIP, USER, "Miami Conference", -1, 2), tripRow(OTHER_TRIP, OTHER, "Secret Trip", -1, 2));
fake.table("personal_projects").push({ id: PROJECT, user_id: USER, kind: "home_project", name: "Kitchen", destination: null, start_date: null, end_date: null, currency: "USD", status: "active", created_at: new Date().toISOString() });
await fake.listen(3199);
const db = createClient("http://127.0.0.1:3199", SERVICE_KEY, { auth: { persistSession: false } });

const photo = (caption?: string) => ({ chat: { id: 5 }, from: { id: 777 }, photo: [{ file_id: "f1" }], ...(caption ? { caption } : {}) });
const lastText = () => String(sent.filter((s) => s.method === "sendMessage").at(-1)?.body.text ?? "");
const lastKeyboard = () => ((sent.filter((s) => s.method === "sendMessage").at(-1)?.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
const press = (data: string, from = 777) => handleCallback(db, { id: "cb", data, from: { id: from }, message: { chat: { id: 5 } } });

// 1. A trip is in progress: a plain photo goes straight to it
await handleMessage(db, photo());
eq(fake.table("expenses").length, 1, "photo with a trip in progress is saved as an expense");
eq(fake.table("expenses")[0].trip_id, TRIP, "...on that trip");
eq(fake.table("expenses")[0].merchant, "Cafe Uno", "...read by the AI reader");
yes(lastText().includes("Saved to <b>Miami Conference · Business</b>"), "reply names the place");
yes(lastText().includes("Trip in progress"), "reply says why");
eq(lastKeyboard().map((b) => b.callback_data), ["chg"], "reply offers Change");

// 2. Change moves it: the expense is removed and the choices are shown
await press("chg");
eq(fake.table("expenses").length, 0, "Change removes the saved expense");
yes(lastKeyboard().some((b) => b.callback_data === "dest:grocery"), "Change lists Groceries");
yes(lastKeyboard().some((b) => b.callback_data === `dest:trip:${TRIP}`), "Change lists the trip");
await press("dest:grocery");
eq(fake.table("grocery_receipts").length, 1, "picking Groceries saves a grocery receipt");
eq(fake.table("grocery_items").length, 2, "...with its items");
eq(fake.table("grocery_receipts")[0].store, "Super Food", "...store read from the receipt");
eq(fake.table("telegram_notify_prefs")[0].last_choice, "grocery", "the choice is remembered");

// 3. Captions choose
fake.table("grocery_receipts").length = 0; fake.table("grocery_items").length = 0;
await handleMessage(db, photo("kitchen tiles"));
eq(fake.table("personal_expenses").length, 1, "caption naming a project saves a personal expense");
eq(fake.table("personal_expenses")[0].project_id, PROJECT, "...in that project");
await handleMessage(db, photo("groceries"));
eq(fake.table("grocery_receipts").length, 1, "caption 'groceries' saves a grocery receipt");

// 4. A PDF is kept as a document
await handleMessage(db, { chat: { id: 5 }, from: { id: 777 }, document: { file_id: "f2", mime_type: "application/pdf", file_name: "policy.pdf" } });
eq(fake.table("travel_documents").length, 1, "a PDF is saved as a travel document");
eq(fake.table("travel_documents")[0].trip_id, null, "...not tied to a trip");
yes(String(fake.table("travel_documents")[0].file_path).startsWith(`${USER}/general/`), "...stored under the person's own folder");

// 5. Nothing is happening today: ask, and save nothing until a choice is made
fake.table("expenses").length = 0;
fake.table("trips")[0].start_date = addDaysISO(today, 10);
fake.table("trips")[0].end_date = addDaysISO(today, 12);
const before = fake.table("expenses").length + fake.table("grocery_receipts").length;
await handleMessage(db, photo());
eq(fake.table("expenses").length + fake.table("grocery_receipts").length, before, "an unclear photo is not saved yet");
yes(lastText().includes("Where does this go?"), "the bot asks where");
yes(lastKeyboard().length >= 3, "...with a button for each place");
eq(lastKeyboard()[0].text.startsWith("✓"), true, "...best guess first and ticked");

// 6. Other people's places are never offered or accepted
await press(`dest:trip:${OTHER_TRIP}`);
yes(lastText().includes("cannot save"), "a trip that belongs to someone else is refused");
eq(fake.table("expenses").filter((e: { trip_id: string }) => e.trip_id === OTHER_TRIP).length, 0, "...and nothing is saved to it");
await press(`dest:trip:${TRIP}`);
eq(fake.table("expenses").length, 1, "choosing a real place saves the held photo");

// 7. /notify
await handleMessage(db, { chat: { id: 5 }, from: { id: 777 }, text: "/notify off" });
eq(fake.table("telegram_notify_prefs").find((p: { user_id: string }) => p.user_id === USER)?.enabled, false, "/notify off is stored");
yes(lastText().includes("Messages from the app: off"), "...and confirmed");
await handleMessage(db, { chat: { id: 5 }, from: { id: 777 }, text: "/notify quiet 23 6" });
eq(fake.table("telegram_notify_prefs").find((p: { user_id: string }) => p.user_id === USER)?.quiet_start, 23, "/notify quiet sets the hours");

// 8. An unlinked account gets told how to link
await handleMessage(db, { chat: { id: 9 }, from: { id: 999 }, photo: [{ file_id: "x" }] });
yes(lastText().includes("not linked"), "unlinked accounts are refused");

// The default-trip button refuses a trip that is not yours
await press(`trip:${OTHER_TRIP}`);
eq(fake.table("profiles").find((p: { id: string }) => p.id === USER).telegram_default_trip_id, null, "someone else's trip cannot become your default");
yes(lastText().includes("cannot find that trip"), "...and you are told");
await press(`trip:${TRIP}`);
eq(fake.table("profiles").find((p: { id: string }) => p.id === USER).telegram_default_trip_id, TRIP, "your own trip can");

// A repeated Telegram update is skipped; a different one and an update without an id are handled
{
  const { claimUpdate } = await import("../src/lib/telegram-updates");
  eq(await claimUpdate(db, 5001), true, "first delivery of an update is handled");
  eq(await claimUpdate(db, 5001), false, "a re-delivery is skipped");
  eq(await claimUpdate(db, 5002), true, "the next update is handled");
  eq(await claimUpdate(db, undefined), true, "an update without an id is handled");
}

await fake.close();
globalThis.fetch = realFetch;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
