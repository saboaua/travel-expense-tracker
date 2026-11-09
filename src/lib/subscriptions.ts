/**
 * My subscriptions (Personal): what a person pays, when it is next due, what needs a look. Pure functions.
 * Each person only ever sees their own rows (the database enforces it); nothing here talks to a bank.
 */
import { CURRENCIES } from "@/lib/currencies";
import { addMonths, daysBetween, isDay } from "@/lib/iptv";

export const CYCLES = [
  { key: "weekly", label: "Weekly", perMonth: 52 / 12, step: { weeks: 1 } },
  { key: "monthly", label: "Monthly", perMonth: 1, step: { months: 1 } },
  { key: "quarterly", label: "Quarterly", perMonth: 1 / 3, step: { months: 3 } },
  { key: "yearly", label: "Yearly", perMonth: 1 / 12, step: { months: 12 } },
] as const;
export type Cycle = (typeof CYCLES)[number]["key"];
export const isCycle = (v: unknown): v is Cycle => CYCLES.some((c) => c.key === v);
export const cycleLabel = (c: string) => CYCLES.find((x) => x.key === c)?.label ?? c;
export const TRIAL_WARNING_DAYS = 2;

export type Sub = {
  id: string; name: string; price: number; currency: string; cycle: Cycle; next_payment: string; category: string | null;
  status: "active" | "paused" | "cancelled"; trial_ends: string | null; split_count: number; remind_days: number;
  cancel_url: string | null; notes: string | null; price_history: { price: number; at: string }[]; reminded_for?: string | null;
};

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The next payment on or after today, counted from the date the person entered (no drift: Jan 31 monthly stays on the last day). */
export function nextPayment(anchor: string, cycle: Cycle, today: string): string {
  if (anchor >= today) return anchor;
  if (cycle === "weekly") {
    const weeks = Math.ceil(daysBetween(anchor, today) / 7);
    return addDays(anchor, weeks * 7);
  }
  const step = CYCLES.find((c) => c.key === cycle)!.step as { months: number };
  let k = Math.max(0, Math.floor(daysBetween(anchor, today) / (step.months * 31)));
  while (addMonths(anchor, k * step.months) < today) k++;
  while (k > 0 && addMonths(anchor, (k - 1) * step.months) >= today) k--;
  return addMonths(anchor, k * step.months);
}

/** While a free trial runs the first charge is the day it ends. */
export const inTrial = (s: Sub, today: string) => !!s.trial_ends && s.trial_ends >= today;
export const nextDue = (s: Sub, today: string) => (inTrial(s, today) ? (s.trial_ends as string) : nextPayment(s.next_payment, s.cycle, today));
export const daysUntil = (s: Sub, today: string) => daysBetween(today, nextDue(s, today));

/** My share of the price (a family plan split three ways). */
export const myShare = (s: Pick<Sub, "price" | "split_count">) => Math.round((s.price / Math.max(1, s.split_count)) * 100) / 100;
/** Cost per month: yearly plans count 1/12, weekly 52/12. Paused, cancelled and trial subscriptions cost nothing yet. */
export function monthlyCost(s: Sub, today: string): number {
  if (s.status !== "active" || inTrial(s, today)) return 0;
  return myShare(s) * CYCLES.find((c) => c.key === s.cycle)!.perMonth;
}

export function totalsByCurrency(subs: Sub[], today: string): { currency: string; monthly: number; yearly: number }[] {
  const map = new Map<string, number>();
  for (const s of subs) {
    const m = monthlyCost(s, today);
    if (m > 0) map.set(s.currency, (map.get(s.currency) ?? 0) + m);
  }
  return [...map.entries()].map(([currency, m]) => ({ currency, monthly: Math.round(m * 100) / 100, yearly: Math.round(m * 12 * 100) / 100 })).sort((a, b) => b.monthly - a.monthly);
}
const usdRate = (code: string) => (code === "USD" ? 1 : CURRENCIES.find((c) => c.code === code)?.usd_rate ?? null);
/** One number for the headline when every currency has a known rate; otherwise null and the per-currency lines are shown. */
export function approxUsd(totals: { currency: string; monthly: number }[]): number | null {
  let sum = 0;
  for (const t of totals) {
    const r = usdRate(t.currency);
    if (r == null) return null;
    sum += t.monthly * r;
  }
  return Math.round(sum * 100) / 100;
}

export type Alert = { kind: "trial" | "price"; id: string; name: string; text: string };
export function priceChange(s: Pick<Sub, "price_history">): { from: number; to: number; percent: number } | null {
  const h = s.price_history;
  if (h.length < 2) return null;
  const from = h[h.length - 2].price;
  const to = h[h.length - 1].price;
  return from > 0 && to !== from ? { from, to, percent: Math.round(((to - from) / from) * 100) } : null;
}
export function alerts(subs: Sub[], today: string): Alert[] {
  const out: Alert[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    if (inTrial(s, today)) {
      const d = daysBetween(today, s.trial_ends as string);
      if (d <= TRIAL_WARNING_DAYS) out.push({ kind: "trial", id: s.id, name: s.name, text: d === 0 ? "Free trial ends today" : `Free trial ends in ${d} day${d === 1 ? "" : "s"}` });
    }
    const pc = priceChange(s);
    if (pc && pc.percent > 0) out.push({ kind: "price", id: s.id, name: s.name, text: `Went up ${pc.percent}%` });
  }
  return out;
}
export function upcoming(subs: Sub[], today: string, withinDays = 30): Sub[] {
  return subs.filter((s) => s.status === "active" && daysUntil(s, today) <= withinDays).sort((a, b) => nextDue(a, today).localeCompare(nextDue(b, today)));
}
/** Subscriptions the daily reminder should mention: due inside their own reminder window and not yet reminded for this date. */
export function dueForReminder(subs: Sub[], today: string): Sub[] {
  return subs.filter((s) => s.status === "active" && daysUntil(s, today) <= s.remind_days && s.reminded_for !== nextDue(s, today));
}

/** Record a new price in the history (the first entry is the price it was added with). */
export function withPrice(history: { price: number; at: string }[], price: number, today: string): { price: number; at: string }[] {
  const last = history[history.length - 1];
  if (last && last.price === price) return history;
  return [...history, { price, at: today }].slice(-50);
}

/* ---------------- checking what the person types ---------------- */

export type SubInput = { name: string; price: string; currency: string; cycle: string; next_payment: string; category: string; trial_ends: string; split_count: string; remind_days: string; cancel_url: string; notes: string };
export function validateSub(i: SubInput): { ok: true; value: Omit<Sub, "id" | "status" | "price_history"> } | { ok: false; error: string } {
  const name = i.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Enter a name." };
  const price = Number(i.price.replace(",", "."));
  if (!i.price.trim() || !Number.isFinite(price) || price < 0 || price >= 1_000_000) return { ok: false, error: "Enter the price as a number, for example 17.99." };
  const currency = i.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Pick a currency." };
  if (!isCycle(i.cycle)) return { ok: false, error: "Pick how often you pay." };
  if (!isDay(i.next_payment)) return { ok: false, error: "Enter the next payment date." };
  if (i.trial_ends && !isDay(i.trial_ends)) return { ok: false, error: "Enter the day the free trial ends." };
  const split = Math.round(Number(i.split_count || "1"));
  if (!Number.isFinite(split) || split < 1 || split > 20) return { ok: false, error: "Split between 1 and 20 people." };
  const remind = Math.round(Number(i.remind_days || "3"));
  if (!Number.isFinite(remind) || remind < 0 || remind > 30) return { ok: false, error: "Remind me between 0 and 30 days before." };
  const url = i.cancel_url.trim();
  if (url && !(/^https?:\/\/\S+$/i.test(url) && url.length <= 500)) return { ok: false, error: "The cancel link must start with http:// or https://." };
  return {
    ok: true,
    value: {
      name, price: Math.round(price * 100) / 100, currency, cycle: i.cycle, next_payment: i.next_payment, category: i.category.trim().slice(0, 40) || null,
      trial_ends: i.trial_ends || null, split_count: split, remind_days: remind, cancel_url: url || null, notes: i.notes.trim().slice(0, 500) || null,
    },
  };
}

/* ---------------- CSV in, calendar out ---------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
const HEADERS: Record<string, string> = {
  name: "name", service: "name", subscription: "name", price: "price", amount: "price", cost: "price", currency: "currency",
  cycle: "cycle", frequency: "cycle", billing: "cycle", interval: "cycle", "next payment": "next_payment", next_payment: "next_payment",
  date: "next_payment", "renewal date": "next_payment", renews: "next_payment", category: "category",
};
export type SubValue = Omit<Sub, "id" | "status" | "price_history">;
export function importCsv(text: string, today: string): { rows: SubValue[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  const rows: SubValue[] = [];
  if (table.length < 2) return { rows, errors: ["The file needs a header row and at least one subscription."] };
  const cols = table[0].map((h) => HEADERS[h.trim().toLowerCase()] ?? "");
  if (!cols.includes("name") || !cols.includes("price")) return { rows, errors: ["The first row must name the columns, at least: name and price."] };
  for (const [n, r] of table.slice(1).entries()) {
    const get = (k: string) => (r[cols.indexOf(k)] ?? "").trim();
    const cycle = get("cycle").toLowerCase().replace(/ly$/, "ly").replace(/^month$/, "monthly").replace(/^year$/, "yearly").replace(/^week$/, "weekly").replace(/^annual$|^annually$/, "yearly");
    const v = validateSub({ name: get("name"), price: get("price"), currency: get("currency") || "USD", cycle: cycle || "monthly", next_payment: get("next_payment") || today, category: get("category"), trial_ends: "", split_count: "1", remind_days: "3", cancel_url: "", notes: "" });
    if (v.ok) rows.push(v.value); else errors.push(`Row ${n + 2}: ${v.error}`);
  }
  if (rows.length > 200) return { rows: rows.slice(0, 200), errors: [...errors, "Only the first 200 rows were read."] };
  return { rows, errors };
}

const ics = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** One repeating all-day event per active subscription, with a reminder. Opens in any calendar app. */
export function buildIcs(subs: Sub[], today: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lifolio//Subscriptions//EN", "CALSCALE:GREGORIAN"];
  for (const s of subs.filter((x) => x.status === "active")) {
    const start = nextDue(s, today).replace(/-/g, "");
    const rule = s.cycle === "weekly" ? "FREQ=WEEKLY" : s.cycle === "monthly" ? "FREQ=MONTHLY" : s.cycle === "quarterly" ? "FREQ=MONTHLY;INTERVAL=3" : "FREQ=YEARLY";
    lines.push(
      "BEGIN:VEVENT", `UID:${s.id}@lifolio`, `DTSTAMP:${today.replace(/-/g, "")}T000000Z`, `DTSTART;VALUE=DATE:${start}`,
      ...(inTrial(s, today) ? [] : [`RRULE:${rule}`]),
      `SUMMARY:${ics(`${s.name} (${s.price.toFixed(2)} ${s.currency})`)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${ics(s.name)}`, `TRIGGER:-P${Math.max(0, s.remind_days)}D`, "END:VALARM", "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
