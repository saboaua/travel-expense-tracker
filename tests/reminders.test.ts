let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); } };
const assert = {
  equal: (a: unknown, b: unknown) => { if (a !== b) throw new Error(`${a} !== ${b}`); },
  ok: (a: unknown) => { if (!a) throw new Error("not ok"); },
  deepEqual: (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); },
  match: (a: string, re: RegExp) => { if (!re.test(a)) throw new Error(`${a} !~ ${re}`); },
};
import { addStep, nextDue, alertTime, needsAlert, statusOf, filterReminders, snoozeTime, parseQuickAdd, dueText, type Reminder } from "../src/lib/reminders";

const now = new Date(2026, 10, 22, 10, 0); // Sun 22 Nov 2026 10:00 local
const mk = (o: Partial<Reminder>): Reminder => ({ id: "1", user_id: "u", title: "t", notes: null, due_at: now.toISOString(), repeat: "none", alert: "at", color: "blue", icon: "bell", done_at: null, snoozed_until: null, last_alerted_for: null, created_at: now.toISOString(), ...o });

test("monthly steps keep month ends", () => {
  assert.equal(addStep(new Date(2026, 0, 31), "monthly").getDate(), 28);
  assert.equal(addStep(new Date(2028, 1, 29), "yearly").getDate(), 28);
});
test("nextDue moves into the future", () => {
  const n = nextDue(new Date(2026, 10, 1, 9), "weekly", now)!;
  assert.ok(n > now); assert.equal(n.getDate(), 29);
  assert.equal(nextDue(now, "none", now), null);
});
test("alert time and snooze", () => {
  assert.equal(alertTime(mk({ alert: "hour" })).getHours(), 9);
  const s = new Date(2026, 10, 22, 12);
  assert.equal(+alertTime(mk({ snoozed_until: s.toISOString() })), +s);
});
test("needsAlert fires once", () => {
  const r = mk({ due_at: new Date(2026, 10, 22, 9, 30).toISOString() });
  assert.equal(needsAlert(r, now), true);
  assert.equal(needsAlert({ ...r, last_alerted_for: r.due_at }, now), false);
  assert.equal(needsAlert({ ...r, done_at: now.toISOString() }, now), false);
  assert.equal(needsAlert(mk({ due_at: new Date(2026, 10, 20).toISOString() }), now), false);
});
test("status and filters", () => {
  const over = mk({ id: "a", due_at: new Date(2026, 10, 21).toISOString() });
  const today = mk({ id: "b", due_at: new Date(2026, 10, 22, 18).toISOString() });
  const later = mk({ id: "c", due_at: new Date(2026, 10, 25).toISOString() });
  const done = mk({ id: "d", done_at: now.toISOString() });
  assert.equal(statusOf(over, now), "overdue"); assert.equal(statusOf(today, now), "today"); assert.equal(statusOf(later, now), "upcoming");
  const all = [later, today, over, done];
  assert.deepEqual(filterReminders(all, "today", now).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(filterReminders(all, "upcoming", now).map((r) => r.id), ["c"]);
  assert.deepEqual(filterReminders(all, "all", now).map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(filterReminders(all, "done", now).map((r) => r.id), ["d"]);
});
test("snooze choices", () => {
  assert.equal(snoozeTime("10m", now).getMinutes(), 10);
  assert.equal(snoozeTime("evening", now).getHours(), 18);
  const t = snoozeTime("tomorrow", now); assert.equal(t.getDate(), 23); assert.equal(t.getHours(), 9);
  assert.equal(snoozeTime("week", now).getDate(), 29);
});
test("quick add sentences", () => {
  let r = parseQuickAdd("Pay rent Fri 9am", now);
  assert.equal(r.title, "Pay rent"); assert.equal(r.due!.getDay(), 5); assert.equal(r.due!.getHours(), 9);
  r = parseQuickAdd("Call mom tomorrow 6:30pm", now);
  assert.equal(r.title, "Call mom"); assert.equal(r.due!.getDate(), 23); assert.equal(r.due!.getHours(), 18); assert.equal(r.due!.getMinutes(), 30);
  r = parseQuickAdd("Buy milk in 2 hours", now);
  assert.equal(r.title, "Buy milk"); assert.equal(r.due!.getHours(), 12);
  r = parseQuickAdd("Water plants", now);
  assert.equal(r.title, "Water plants"); assert.equal(r.due, null);
  r = parseQuickAdd("Meds at 8am", now);
  assert.equal(r.title, "Meds"); assert.equal(r.due!.getDate(), 23);
});
test("due text", () => {
  assert.match(dueText(new Date(2026, 10, 22, 18).toISOString(), now), /^Today 6:00 PM$/);
  assert.match(dueText(new Date(2026, 10, 23, 9).toISOString(), now), /^Tomorrow 9:00 AM$/);
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("reminders: all checks passed");
