// Run with: npx tsx tests/telegram-notify.test.ts
import { DEFAULT_PREFS, escapeHtml, inQuietHours, localHour, normalizePrefs, shouldSend } from "../src/lib/telegram-notify";
import { applyNotifyCommand, captionTarget, notifyStatus, parseCommand } from "../src/lib/telegram-commands";
import { buildScanOptions } from "../src/lib/scan-destination";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

// 02:00 UTC is 22:00 in Aruba (UTC-4), 15:00 UTC is 11:00
eq(localHour(new Date("2026-11-05T02:00:00Z"), "America/Aruba"), 22, "local hour in Aruba (night)");
eq(localHour(new Date("2026-11-05T15:00:00Z"), "America/Aruba"), 11, "local hour in Aruba (day)");
eq(localHour(new Date("2026-11-05T15:00:00Z"), "Not/AZone"), 15, "bad zone falls back to UTC");
eq(localHour(new Date("2026-11-05T04:00:00Z"), "America/Aruba"), 0, "midnight is 0, not 24");

eq(inQuietHours(23, 22, 7), true, "quiet wraps midnight: 23");
eq(inQuietHours(3, 22, 7), true, "quiet wraps midnight: 3");
eq(inQuietHours(7, 22, 7), false, "quiet ends at the end hour");
eq(inQuietHours(12, 22, 7), false, "noon is not quiet");
eq(inQuietHours(13, 12, 14), true, "same-day quiet window");
eq(inQuietHours(5, 6, 6), false, "start equal to end: no quiet time");

const day = new Date("2026-11-05T15:00:00Z"); // 11:00 Aruba
const night = new Date("2026-11-05T05:00:00Z"); // 01:00 Aruba
eq(shouldSend(DEFAULT_PREFS, "trip_reminder", day).send, true, "reminder in the day goes");
eq(shouldSend(DEFAULT_PREFS, "trip_reminder", night).reason, "quiet", "reminder at night waits");
eq(shouldSend(DEFAULT_PREFS, "admin_alert", night, true).send, true, "urgent alert ignores quiet hours");
eq(shouldSend({ ...DEFAULT_PREFS, enabled: false }, "admin_alert", day, true).reason, "off", "master switch beats urgent");
eq(shouldSend({ ...DEFAULT_PREFS, trip_reminders: false }, "trip_reminder", day).reason, "kind_off", "reminders switched off");
eq(shouldSend({ ...DEFAULT_PREFS, trip_reminders: false }, "document_reminder", day).reason, "kind_off", "document reminders follow the same switch");
eq(shouldSend({ ...DEFAULT_PREFS, trip_reminders: false }, "admin_alert", day).send, true, "other kinds unaffected");

eq(normalizePrefs(null), DEFAULT_PREFS, "no row gives defaults");
eq(normalizePrefs({ quiet_start: 99, tz: "" }).quiet_start, 22, "bad hour falls back");
eq(normalizePrefs({ enabled: false }).enabled, false, "stored value kept");
eq(escapeHtml("A & <B>"), "A &amp; &lt;B&gt;", "html escaped");

eq(parseCommand("/notify@TravelBot quiet 22 7"), { name: "notify", args: ["quiet", "22", "7"] }, "command with bot name and args");
eq(parseCommand("hello"), null, "plain text is not a command");
eq(parseCommand("/"), null, "lone slash");

const off = applyNotifyCommand(DEFAULT_PREFS, ["off"]);
eq(off.patch, { enabled: false }, "/notify off");
eq(applyNotifyCommand(DEFAULT_PREFS, ["reminders", "off"]).patch, { trip_reminders: false }, "/notify reminders off");
eq(applyNotifyCommand(DEFAULT_PREFS, ["alerts", "on"]).patch, { admin_alerts: true }, "/notify alerts on");
eq(applyNotifyCommand(DEFAULT_PREFS, ["quiet", "23", "6"]).patch, { quiet_start: 23, quiet_end: 6 }, "/notify quiet 23 6");
eq(applyNotifyCommand(DEFAULT_PREFS, ["quiet", "off"]).patch, { quiet_start: 0, quiet_end: 0 }, "/notify quiet off");
eq(applyNotifyCommand(DEFAULT_PREFS, ["quiet", "25", "6"]).patch, {}, "hour out of range is refused");
eq(applyNotifyCommand(DEFAULT_PREFS, []).reply, notifyStatus(DEFAULT_PREFS), "/notify alone shows the status");
eq(applyNotifyCommand(DEFAULT_PREFS, ["banana"]).patch, {}, "unknown option changes nothing");

const options = buildScanOptions({
  trips: [{ id: "t1", name: "Miami Conference", destination: "Miami", start_date: "2026-11-03", end_date: "2026-11-07" }, { id: "t2", name: "Miami", destination: "Miami", start_date: "2026-12-01", end_date: null }],
  projects: [{ id: "p1", kind: "home_project", name: "Kitchen", destination: null, start_date: null, end_date: null, status: "active" }],
  canTrips: true, canPersonal: true, canDocuments: true,
});
eq(captionTarget("groceries", options)?.key, "grocery", "caption: groceries");
eq(captionTarget("Supermarket run", options)?.key, "grocery", "caption: supermarket");
eq(captionTarget("my passport", options)?.key, "document", "caption: passport");
eq(captionTarget("dinner miami conference", options)?.key, "trip:t1", "caption: longer trip name wins");
eq(captionTarget("kitchen tiles", options)?.key, "project:p1", "caption: project name");
eq(captionTarget("lunch", options), null, "caption: nothing matches");
eq(captionTarget(null, options), null, "no caption");
eq(captionTarget("groceries", options.filter((o) => o.kind !== "grocery")), null, "caption names a place the person cannot use");
