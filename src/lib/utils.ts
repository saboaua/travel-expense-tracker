import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  // Date-only strings (YYYY-MM-DD) are calendar dates: format them in UTC so they never shift a day.
  const dateOnly = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(new Date(date));
}

/** Today's calendar date (YYYY-MM-DD) in the app's home time zone (Aruba). */
export function todayISO(timeZone = "America/Aruba", now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** A YYYY-MM-DD date moved by `days` (negative = earlier). Plain calendar maths, no time zone involved. */
export function addDaysISO(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/** "Nov 17–20", "Nov 28 – Dec 2" or "Dec 30, 2026 – Jan 2, 2027" from two YYYY-MM-DD strings. */
export function formatDateRange(start: string, end?: string | null) {
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const s = new Date(`${start}T00:00:00Z`);
  if (!end || end === start) return `${mon(s)} ${s.getUTCDate()}`;
  const e = new Date(`${end}T00:00:00Z`);
  if (s.getUTCFullYear() !== e.getUTCFullYear()) return `${formatDate(start)} – ${formatDate(end)}`;
  if (s.getUTCMonth() === e.getUTCMonth()) return `${mon(s)} ${s.getUTCDate()}\u2013${e.getUTCDate()}`;
  return `${mon(s)} ${s.getUTCDate()} \u2013 ${mon(e)} ${e.getUTCDate()}`;
}

/** "Today", "Yesterday" or "Tue, Oct 14" for a YYYY-MM-DD expense date. */
export function formatDayHeading(date: string, today: string) {
  if (date === today) return "Today";
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (date === y.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
