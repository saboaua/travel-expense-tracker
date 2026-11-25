// Run with: npx tsx tests/telegram-kinds.test.ts
import { ADMIN_KEYS, TELEGRAM_KEYS, copyPhoneChoices, countOn, legacyFlags, normalizeKinds, parseKindsPatch, visibleKeys } from "../src/lib/telegram-kinds";
import { DEFAULT_PREFS, loadPrefs, normalizePrefs, shouldSend } from "../src/lib/telegram-notify";
import { DEFAULT_PUSH_PREFS, PUSH_PREF_KEYS } from "../src/lib/push-prefs";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

eq(TELEGRAM_KEYS.length, PUSH_PREF_KEYS.length + 1, "every phone alert has a Telegram switch, plus the weekly summary");
eq(PUSH_PREF_KEYS.every((k) => (TELEGRAM_KEYS as readonly string[]).includes(k)), true, "no phone alert is missing from Telegram");

// Nothing chosen yet: the old kinds follow the old switches, the new ones start off
const fresh = normalizeKinds(null, { trip_reminders: true, admin_alerts: true });
eq([fresh.trips, fresh.documents, fresh.summary, fresh.support, fresh.accountRequests, fresh.iptv], [true, true, true, true, true, true], "the kinds that already went to Telegram stay on");
eq(TELEGRAM_KEYS.filter((k) => fresh[k]).sort(), ["accountRequests", "documents", "iptv", "summary", "support", "trips"], "new alerts start off for Telegram");
const off = normalizeKinds({}, { trip_reminders: false, admin_alerts: false });
eq(TELEGRAM_KEYS.some((k) => off[k]), false, "someone who had turned reminders off stays off");
eq(normalizeKinds({ budget: true, trips: false, junk: true, flights: "yes" }, { trip_reminders: true, admin_alerts: true }).budget, true, "a saved choice wins");
eq(normalizeKinds({ trips: false }, { trip_reminders: true, admin_alerts: true }).trips, false, "a saved off wins over the old switch");
eq(normalizeKinds({ flights: "yes" }, { trip_reminders: true, admin_alerts: true }).flights, false, "a wrong type is ignored");

eq(parseKindsPatch({ budget: true }), { budget: true }, "a patch keeps a known key");
eq(parseKindsPatch({ budget: "x" }), null, "a patch with the wrong type is refused");
eq(parseKindsPatch({ nope: true }), null, "a patch with nothing known is refused");

eq(visibleKeys(false).some((k) => ADMIN_KEYS.includes(k)), false, "admin alerts are hidden from everyone else");
eq(visibleKeys(true).length, TELEGRAM_KEYS.length, "an admin sees all");
eq(countOn(fresh, false), { on: 3, total: TELEGRAM_KEYS.length - ADMIN_KEYS.length }, "count for a normal person");
eq(countOn(fresh, true), { on: 6, total: TELEGRAM_KEYS.length }, "count for an admin");

const copied = copyPhoneChoices({ ...DEFAULT_PUSH_PREFS, budget: false, views: true }, fresh);
eq([copied.budget, copied.views, copied.trips, copied.summary], [false, true, true, true], "copying the phone choices keeps the weekly summary");
eq(legacyFlags({ ...fresh, trips: false, documents: false, summary: false }), { trip_reminders: false, admin_alerts: true }, "old switches follow the new ones");

// The decision for a sender
const day = new Date("2026-11-05T15:00:00Z");
const night = new Date("2026-11-05T05:00:00Z");
const withKinds = (patch: object) => ({ ...DEFAULT_PREFS, kinds: { ...fresh, ...patch } });
eq(shouldSend(withKinds({ budget: true }), "alert", day, false, "budget").send, true, "an alert switched on goes");
eq(shouldSend(withKinds({ budget: false }), "alert", day, false, "budget").reason, "kind_off", "an alert switched off stays home");
eq(shouldSend(withKinds({ budget: true }), "alert", night, false, "budget").reason, "quiet", "quiet hours hold it");
eq(shouldSend(withKinds({ budget: true }), "alert", night, true, "budget").send, true, "held ones are sent when quiet ends");
eq(shouldSend({ ...withKinds({ budget: true }), enabled: false }, "alert", day, false, "budget").reason, "off", "the master switch beats every alert");
eq(shouldSend(withKinds({ trips: false }), "trip_reminder", day).reason, "kind_off", "trip reminders follow the Trips switch");
eq(shouldSend(withKinds({ documents: false }), "document_reminder", day).reason, "kind_off", "document expiry follows its switch");
eq(shouldSend(withKinds({ summary: false }), "summary", day).reason, "kind_off", "the weekly summary has its own switch");
eq(normalizePrefs({ trip_reminders: false }).kinds.trips, false, "an old row with reminders off gives Trips off");

// Quiet hours are the phone's once the person set them there
const fake = (telegram: object | null, push: object | null) => ({
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: t === "profiles" ? { push_prefs: push } : telegram, error: null }) };
    void q;
    return chain;
  },
});
(async () => {
  const own = { enabled: true, trip_reminders: true, admin_alerts: true, quiet_start: 22, quiet_end: 7, tz: "America/Aruba", last_choice: null };
  const a = await loadPrefs(fake(own, { quiet: { on: true, start: 23, end: 6 } }) as never, "u");
  eq([a.quiet_start, a.quiet_end], [23, 6], "Telegram uses the quiet hours from the phone");
  const b = await loadPrefs(fake(own, { quiet: { on: false, start: 23, end: 6 } }) as never, "u");
  eq(b.quiet_start === b.quiet_end, true, "phone quiet hours off means no quiet time in Telegram");
  const c = await loadPrefs(fake(own, { budget: true }) as never, "u");
  eq([c.quiet_start, c.quiet_end], [22, 7], "never set on the phone: Telegram keeps its own");
})();
