/** Pure helpers for Reminders (Personal > "Reminders"): times, repeats, filters, snoozing and the quick-add sentence. No database here. */

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type AlertWhen = "at" | "hour" | "day";
export type Reminder = {
  id: string; user_id: string; title: string; notes: string | null; due_at: string; repeat: Repeat; alert: AlertWhen;
  color: string; icon: string; done_at: string | null; snoozed_until: string | null; last_alerted_for: string | null; created_at: string;
};

export const REPEATS: { id: Repeat; label: string }[] = [
  { id: "none", label: "Never" }, { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" },
];
export const ALERTS: { id: AlertWhen; label: string }[] = [
  { id: "at", label: "At the time" }, { id: "hour", label: "1 hour before" }, { id: "day", label: "1 day before" },
];
export const REMINDER_COLORS = [
  { id: "blue", hex: "#2563eb" }, { id: "green", hex: "#16a34a" }, { id: "amber", hex: "#d97706" }, { id: "red", hex: "#dc2626" },
  { id: "purple", hex: "#7c3aed" }, { id: "pink", hex: "#db2777" }, { id: "teal", hex: "#0d9488" }, { id: "slate", hex: "#475569" },
] as const;
export const REMINDER_ICONS = ["bell", "cart", "home", "car", "heart", "briefcase", "plane", "gift", "pill", "phone", "card", "star"] as const;
export const PHOTO_LIMIT = { free: 3, pro: 10 } as const;

export const colorHex = (id: string) => REMINDER_COLORS.find((c) => c.id === id)?.hex ?? REMINDER_COLORS[0].hex;
export const isRepeat = (v: unknown): v is Repeat => REPEATS.some((r) => r.id === v);
export const isAlert = (v: unknown): v is AlertWhen => ALERTS.some((r) => r.id === v);

/** Adds one repeat step. Month ends are kept (31 Jan + 1 month = 28/29 Feb). */
export function addStep(d: Date, repeat: Repeat): Date {
  const o = new Date(d);
  if (repeat === "daily") o.setDate(o.getDate() + 1);
  else if (repeat === "weekly") o.setDate(o.getDate() + 7);
  else if (repeat === "monthly" || repeat === "yearly") {
    const day = o.getDate();
    o.setDate(1);
    o.setMonth(o.getMonth() + (repeat === "monthly" ? 1 : 12));
    const last = new Date(o.getFullYear(), o.getMonth() + 1, 0).getDate();
    o.setDate(Math.min(day, last));
  }
  return o;
}

/** The next time after `after` (a repeating reminder moves forward until it is in the future). */
export function nextDue(due: Date, repeat: Repeat, after: Date): Date | null {
  if (repeat === "none") return null;
  let n = new Date(due);
  for (let i = 0; i < 2000 && n <= after; i++) n = addStep(n, repeat);
  return n;
}

/** When the alert should fire. A snooze replaces it. */
export function alertTime(r: Pick<Reminder, "due_at" | "alert" | "snoozed_until">): Date {
  if (r.snoozed_until) return new Date(r.snoozed_until);
  const d = new Date(r.due_at);
  if (r.alert === "hour") d.setHours(d.getHours() - 1);
  else if (r.alert === "day") d.setDate(d.getDate() - 1);
  return d;
}

/** True when the alert is due now and has not been sent for this time yet. */
export function needsAlert(r: Reminder, now: Date): boolean {
  if (r.done_at) return false;
  const at = alertTime(r);
  if (at > now) return false;
  // Too old to be useful (over a day late): skip rather than ping about something long gone.
  if (now.getTime() - at.getTime() > 24 * 3600 * 1000) return false;
  const key = (r.snoozed_until ?? r.due_at);
  return !r.last_alerted_for || new Date(r.last_alerted_for).getTime() !== new Date(key).getTime();
}

export type Status = "done" | "overdue" | "today" | "upcoming";
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export function statusOf(r: Pick<Reminder, "due_at" | "done_at" | "snoozed_until">, now: Date): Status {
  if (r.done_at) return "done";
  const due = new Date(r.snoozed_until ?? r.due_at);
  if (due < now) return "overdue";
  return dayKey(due) === dayKey(now) ? "today" : "upcoming";
}

export type Filter = "today" | "upcoming" | "all" | "done";
export function filterReminders(list: Reminder[], filter: Filter, now: Date): Reminder[] {
  const when = (r: Reminder) => new Date(r.snoozed_until ?? r.due_at).getTime();
  const open = list.filter((r) => !r.done_at).sort((a, b) => when(a) - when(b));
  if (filter === "done") return list.filter((r) => r.done_at).sort((a, b) => +new Date(b.done_at!) - +new Date(a.done_at!));
  if (filter === "today") return open.filter((r) => { const s = statusOf(r, now); return s === "overdue" || s === "today"; });
  if (filter === "upcoming") return open.filter((r) => statusOf(r, now) === "upcoming");
  return open;
}
/** Overdue first, then by time. */
export const overdueOf = (list: Reminder[], now: Date) => list.filter((r) => statusOf(r, now) === "overdue");

export type SnoozeChoice = "10m" | "1h" | "evening" | "tomorrow" | "week";
export const SNOOZES: { id: SnoozeChoice; label: string }[] = [
  { id: "10m", label: "10 minutes" }, { id: "1h", label: "1 hour" }, { id: "evening", label: "This evening" }, { id: "tomorrow", label: "Tomorrow morning" }, { id: "week", label: "Next week" },
];
export function snoozeTime(choice: SnoozeChoice, now: Date): Date {
  const d = new Date(now);
  if (choice === "10m") d.setMinutes(d.getMinutes() + 10);
  else if (choice === "1h") d.setHours(d.getHours() + 1);
  else if (choice === "evening") { d.setHours(18, 0, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
  else if (choice === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  return d;
}

/** The "When" chips of the form. */
export function quickWhen(now: Date) {
  const today6 = new Date(now); today6.setHours(18, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const weekend = new Date(now); weekend.setHours(10, 0, 0, 0);
  const add = (6 - weekend.getDay() + 7) % 7;
  weekend.setDate(weekend.getDate() + (add === 0 && weekend <= now ? 7 : add));
  return { today: today6 > now ? today6 : null, tomorrow, weekend };
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** "Pay rent Fri 9am" -> { title: "Pay rent", due }. Understands today, tonight, tomorrow, a weekday, "in 2 hours/days", and a time like 9am or 18:30. */
export function parseQuickAdd(text: string, now: Date): { title: string; due: Date | null } {
  let t = ` ${text.trim()} `;
  let date: Date | null = null;
  let h: number | null = null, m = 0;
  const cut = (re: RegExp) => { t = t.replace(re, " "); };
  let mt = t.match(/\bin (\d{1,3}) ?(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (mt) {
    const n = +mt[1], u = mt[2].toLowerCase();
    const d = new Date(now);
    if (u.startsWith("m")) d.setMinutes(d.getMinutes() + n); else if (u.startsWith("h")) d.setHours(d.getHours() + n); else d.setDate(d.getDate() + n);
    const title = t.replace(mt[0], " ").replace(/\s+/g, " ").trim();
    return { title, due: u.startsWith("d") ? withTime(d, 9, 0) : d };
  }
  mt = t.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/i) || t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (mt) {
    h = +mt[1]; m = mt[2] ? +mt[2] : 0;
    const ap = (mt[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (h > 23) h = null; else cut(new RegExp(mt[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  if (/\btomorrow\b/i.test(t)) { date = new Date(now); date.setDate(date.getDate() + 1); cut(/\btomorrow\b/i); }
  else if (/\btonight\b/i.test(t)) { date = new Date(now); if (h === null) { h = 20; m = 0; } cut(/\btonight\b/i); }
  else if (/\btoday\b/i.test(t)) { date = new Date(now); cut(/\btoday\b/i); }
  else {
    const dm = t.match(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/i);
    if (dm) {
      const idx = DAYS.indexOf(dm[1].toLowerCase().slice(0, 3));
      date = new Date(now);
      let add = (idx - date.getDay() + 7) % 7;
      if (add === 0) add = 7;
      date.setDate(date.getDate() + add);
      cut(new RegExp(`\\b${dm[0]}\\b`, "i"));
    }
  }
  const title = t.replace(/\b(on|at|by)\s*$/i, " ").replace(/\s+/g, " ").trim();
  if (!date && h === null) return { title, due: null };
  let due = date ? new Date(date) : new Date(now);
  due = withTime(due, h ?? 9, m);
  if (!date && due <= now) due.setDate(due.getDate() + 1);
  return { title, due };
}
function withTime(d: Date, h: number, m: number) { const o = new Date(d); o.setHours(h, m, 0, 0); return o; }

/** "Today 6:00 PM", "Tomorrow 9:00 AM", "Fri 3 Dec, 9:00 AM". */
export function dueText(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  if (dayKey(d) === dayKey(now)) return `Today ${time}`;
  if (dayKey(d) === dayKey(tom)) return `Tomorrow ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}, ${time}`;
}
export const repeatText = (r: Repeat) => (r === "none" ? "" : REPEATS.find((x) => x.id === r)!.label.toLowerCase());

/** `datetime-local` input value in the viewer's own time. */
export function toInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A row as the database sends it, with safe values for anything missing (an older row, a partly saved one). */
export function normalizeReminder(r: Partial<Reminder> & { id: string }): Reminder {
  return {
    user_id: "", title: "", notes: null, due_at: new Date().toISOString(), done_at: null, snoozed_until: null, last_alerted_for: null, created_at: new Date().toISOString(),
    ...r,
    repeat: isRepeat(r.repeat) ? r.repeat : "none", alert: isAlert(r.alert) ? r.alert : "at", color: r.color || "blue", icon: r.icon || "bell",
  } as Reminder;
}
