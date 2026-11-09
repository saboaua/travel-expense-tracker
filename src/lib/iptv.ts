/**
 * IPTV clients (admin only): dates, status and the message to a client. Pure functions so the rules are tested.
 * Dates are plain days (YYYY-MM-DD); "today" is always passed in, so nothing here reads the clock.
 */

export const FREQUENCIES = [
  { key: "monthly", label: "Monthly", months: 1 },
  { key: "yearly", label: "Yearly", months: 12 },
  { key: "2years", label: "2 years", months: 24 },
  { key: "3years", label: "3 years", months: 36 },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["key"];
/** The admin is told this many days before a service ends. */
export const REMINDER_DAYS = 15;
/** At or below this many days a client is in "Contact now" (together with the expired ones). */
export const URGENT_DAYS = 7;

export const isFrequency = (v: unknown): v is Frequency => FREQUENCIES.some((f) => f.key === v);
export const monthsOf = (f: Frequency) => FREQUENCIES.find((x) => x.key === f)!.months;
export const frequencyLabel = (f: string) => FREQUENCIES.find((x) => x.key === f)?.label ?? f;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isDay(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const pad = (n: number) => String(n).padStart(2, "0");
const dim = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Same rule as the database: the day stays, or becomes the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(day: string, months: number): string {
  const m = DATE_RE.exec(day)!;
  const total = +m[1] * 12 + (+m[2] - 1) + months;
  const y = Math.floor(total / 12);
  const m0 = ((total % 12) + 12) % 12;
  return `${y}-${pad(m0 + 1)}-${pad(Math.min(+m[3], dim(y, m0)))}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Date subscribed + frequency */
export const computeExpiry = (subscribed: string, f: Frequency) => addMonths(subscribed, monthsOf(f));
/** A renewal moves the expiry on by one more period, counted from the old expiry (or from today when it had already lapsed). */
export const renewedExpiry = (expire: string, on: string, f: Frequency) => addMonths(expire > on ? expire : on, monthsOf(f));

export const daysLeft = (expire: string, today: string) => daysBetween(today, expire);

/** "0 years, 4 months, 22 days" */
export function breakdown(expire: string, today: string): { years: number; months: number; days: number; expired: boolean } {
  if (expire < today) return { years: 0, months: 0, days: daysBetween(expire, today), expired: true };
  const a = DATE_RE.exec(today)!;
  const b = DATE_RE.exec(expire)!;
  let m = (+b[1] - +a[1]) * 12 + (+b[2] - +a[2]);
  if (addMonths(today, m) > expire) m--;
  return { years: Math.floor(m / 12), months: m % 12, days: daysBetween(addMonths(today, m), expire), expired: false };
}
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
export function breakdownText(expire: string, today: string): string {
  const b = breakdown(expire, today);
  if (b.expired) return b.days === 0 ? "Ended today" : `Ended ${plural(b.days, "day")} ago`;
  return `${plural(b.years, "year")}, ${plural(b.months, "month")}, ${plural(b.days, "day")}`;
}

export type Urgency = "expired" | "now" | "soon" | "ok";
export function urgencyOf(days: number): Urgency {
  if (days < 0) return "expired";
  if (days <= URGENT_DAYS) return "now";
  if (days <= REMINDER_DAYS) return "soon";
  return "ok";
}
export function daysLabel(days: number): string {
  if (days < 0) return `Expired ${plural(-days, "day")} ago`;
  if (days === 0) return "Ends today";
  return `${plural(days, "day")} left`;
}

export type ClientLike = { id: string; client_name: string; expire_date: string };
export function sortClients<T extends ClientLike>(list: T[]): T[] {
  return [...list].sort((a, b) => a.expire_date.localeCompare(b.expire_date) || a.client_name.localeCompare(b.client_name));
}
export function groupClients<T extends ClientLike>(list: T[], today: string) {
  const g = { contactNow: [] as T[], soon: [] as T[], later: [] as T[] };
  for (const c of sortClients(list)) {
    const u = urgencyOf(daysLeft(c.expire_date, today));
    (u === "expired" || u === "now" ? g.contactNow : u === "soon" ? g.soon : g.later).push(c);
  }
  return g;
}
export function summary<T extends ClientLike>(list: T[], today: string) {
  const g = groupClients(list, today);
  return { contactNow: g.contactNow.length, soon: g.soon.length, active: list.filter((c) => c.expire_date >= today).length, total: list.length };
}
/** Clients the daily reminder should mention: ending within the notice period and not yet reminded for this expiry. */
export function dueForReminder<T extends ClientLike & { reminded_for?: string | null }>(list: T[], today: string): T[] {
  return list.filter((c) => daysLeft(c.expire_date, today) <= REMINDER_DAYS && c.reminded_for !== c.expire_date);
}

/* ---------------- the message to a client ---------------- */

export function renewalMessage(c: { client_name: string; plan: string; expire_date: string }, today: string, owner = ""): string {
  const days = daysLeft(c.expire_date, today);
  const first = c.client_name.trim().split(/\s+/)[0] || "there";
  const when = days < 0 ? `ended on ${c.expire_date}` : days === 0 ? "ends today" : `ends in ${plural(days, "day")} (${c.expire_date})`;
  return `Hi ${first}, your ${c.plan} TV service ${when}. Would you like to renew? Reply here and I will take care of it.${owner ? ` ${owner}` : ""}`.trim();
}

/** WhatsApp for a phone number, a mail link for an email, nothing for anything else. */
export function contactUrl(contact: string | null | undefined, text: string, subject = "Your TV service"): string | null {
  const c = (contact || "").trim();
  if (!c) return null;
  if (c.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? `mailto:${c}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : null;
  const digits = c.replace(/[^\d]/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/* ---------------- checking what the admin types ---------------- */

/** "00-1a-79-4c-2e-91" or "001A794C2E91" -> "00:1A:79:4C:2E:91"; "" for none; null when it is not a MAC. */
export function normalizeMac(input: string): string | null {
  const t = input.trim();
  if (!t) return "";
  const hex = t.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12 || /[^0-9a-fA-F:.\-\s]/.test(t)) return null;
  return hex.match(/.{2}/g)!.join(":");
}
export function cleanUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return "";
  return /^https?:\/\/[^\s]+$/i.test(t) && t.length <= 300 ? t : null;
}

export type ClientInput = {
  client_name: string; contact: string; plan: string; model: string; order_no: string; donation: string; portal: string; mac: string;
  device_id: string; location: string; date_subscribed: string; frequency: string; expire_date: string; notes: string;
};
export type ClientRow = {
  client_name: string; contact: string | null; plan: string; model: string | null; order_no: string | null; donation: number | null; portal: string | null;
  mac: string | null; device_id: string | null; location: string | null; date_subscribed: string; frequency: Frequency; expire_date: string; notes: string | null;
};
export const blankClient = (today: string): ClientInput => ({
  client_name: "", contact: "", plan: "", model: "", order_no: "", donation: "", portal: "", mac: "", device_id: "", location: "",
  date_subscribed: today, frequency: "monthly", expire_date: "", notes: "",
});

export function validateClient(i: ClientInput): { ok: true; value: ClientRow } | { ok: false; error: string } {
  const t = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max);
  const name = t(i.client_name, 80);
  if (!name) return { ok: false, error: "Enter the client's name." };
  const plan = t(i.plan, 60);
  if (!plan) return { ok: false, error: "Enter the subscription (the package they bought)." };
  if (!isFrequency(i.frequency)) return { ok: false, error: "Pick how often it renews." };
  if (!isDay(i.date_subscribed)) return { ok: false, error: "Enter the date they subscribed." };
  const mac = normalizeMac(i.mac);
  if (mac === null) return { ok: false, error: "That MAC address does not look right. It has 12 letters and numbers, like 00:1A:79:4C:2E:91." };
  const portal = cleanUrl(i.portal);
  if (portal === null) return { ok: false, error: "The portal must be a web address starting with http:// or https://." };
  let donation: number | null = null;
  if (i.donation.trim()) {
    donation = Number(i.donation.replace(",", "."));
    if (!Number.isFinite(donation) || donation < 0 || donation >= 1_000_000) return { ok: false, error: "Enter the donation as a number, for example 15.00." };
    donation = Math.round(donation * 100) / 100;
  }
  const expire = i.expire_date && isDay(i.expire_date) ? i.expire_date : computeExpiry(i.date_subscribed, i.frequency);
  if (expire < i.date_subscribed) return { ok: false, error: "The expire date cannot be before the date they subscribed." };
  const orNull = (v: string, max: number) => t(v, max) || null;
  return {
    ok: true,
    value: {
      client_name: name, contact: orNull(i.contact, 120), plan, model: orNull(i.model, 60), order_no: orNull(i.order_no, 40), donation, portal: portal || null,
      mac: mac || null, device_id: orNull(i.device_id, 60), location: orNull(i.location, 80), date_subscribed: i.date_subscribed, frequency: i.frequency,
      expire_date: expire, notes: orNull(i.notes, 500),
    },
  };
}

/** The only fields a client may ever be shown (the database returns exactly these). */
export const CLIENT_VIEW_FIELDS = ["first_name", "plan", "frequency", "date_subscribed", "expire_date", "owner_name", "owner_contact", "history"] as const;
export type ClientView = {
  first_name: string; plan: string; frequency: string; date_subscribed: string; expire_date: string;
  owner_name: string; owner_contact: string | null; history: { renewed_on: string; frequency: string; expires_after: string }[];
};
export function cleanClientView(raw: unknown): ClientView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.plan !== "string" || !isDay(r.expire_date)) return null;
  const hist = Array.isArray(r.history) ? r.history : [];
  return {
    first_name: typeof r.first_name === "string" ? r.first_name : "",
    plan: r.plan,
    frequency: typeof r.frequency === "string" ? r.frequency : "",
    date_subscribed: isDay(r.date_subscribed) ? r.date_subscribed : "",
    expire_date: r.expire_date,
    owner_name: typeof r.owner_name === "string" ? r.owner_name : "your provider",
    owner_contact: typeof r.owner_contact === "string" && r.owner_contact ? r.owner_contact : null,
    history: hist
      .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && isDay((h as Record<string, unknown>).renewed_on))
      .map((h) => ({ renewed_on: h.renewed_on as string, frequency: String(h.frequency ?? ""), expires_after: isDay(h.expires_after) ? (h.expires_after as string) : "" })),
  };
}
