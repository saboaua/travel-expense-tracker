/**
 * The words of every phone alert. Two styles: "details" names the trip, flight, subscription or person with a date or
 * time; "private" is the old generic wording. Neither ever carries an amount, a card or document number or a confirmation code.
 */
import type { PushDetail } from "@/lib/push-prefs";

export const PUSH_TEXT = {
  invite: { title: "Lifolio", body: "You have a new sharing invite." },
  accepted: { title: "Lifolio", body: "Your sharing invite was answered." },
  shared: { title: "Lifolio", body: "Something new was shared with you." },
  unshared: { title: "Lifolio", body: "A partner changed what they share with you." },
  ended: { title: "Lifolio", body: "A sharing pairing has ended." },
  view: { title: "Lifolio", body: "A partner opened something you shared." },
  subscription: { title: "Lifolio", body: "A subscription payment is coming up." },
  iptv: { title: "Lifolio", body: "Some IPTV clients are about to expire." },
  trip: { title: "Lifolio", body: "A trip is coming up. Open the app to check your plans." },
  flight: { title: "Lifolio", body: "A flight on your trip changed. Open the app to check it." },
  flightTomorrow: { title: "Lifolio", body: "You have a flight tomorrow. Open the app to check it." },
  afterTrip: { title: "Lifolio", body: "A trip has ended. Open the app to add your last receipts." },
  document: { title: "Lifolio", body: "A document is about to expire. Open the app to check it." },
  utility: { title: "Lifolio", body: "Time to add your utility bills for this month." },
  billEmail: { title: "Lifolio", body: "A new utility bill arrived by email." },
  budget: { title: "Lifolio", body: "A reminder about your monthly budget." },
  support: { title: "Lifolio", body: "A new support request arrived." },
  test: { title: "Lifolio", body: "Alerts are working on this device." },
} as const;
export type PushKind = keyof typeof PUSH_TEXT;

/** The facts a message may use. Everything is optional: with nothing to say, the generic wording is used. */
export type PushData = {
  by?: string;
  item?: string;
  itemKind?: string;
  subscriptions?: { name: string; due: string }[];
  /** whole days until the date in `due` / `start` / `expiry` (negative: days ago) */
  days?: number;
  count?: number;
  date?: string;
  trip?: string;
  flight?: { number: string; from: string | null; to: string | null; time: string | null };
  label?: string;
  subject?: string;
};

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-17" -> "Nov 17" (and the year when it is not this year's, given `today`). */
export function shortDate(iso: string | undefined, today?: string): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const base = `${MON[Number(m[2]) - 1]} ${Number(m[3])}`;
  return today && today.slice(0, 4) !== m[1] ? `${base}, ${m[1]}` : base;
}
/** "2026-11-17T09:45" -> "9:45 AM" */
export function clockText(local: string | null | undefined): string {
  const m = local?.match(/T(\d{2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
const inDays = (d: number) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);
const itemPhrase = (kind: string | undefined, item: string) => (kind === "loyalty_card" ? `the loyalty card ${item}` : `the trip ${item}`);
const route = (f: NonNullable<PushData["flight"]>) => (f.from && f.to ? `${f.from} to ${f.to}` : f.from ? `from ${f.from}` : "");

/** The detailed wording, or null when there is not enough to be specific (then the generic wording is used). */
function detailed(kind: PushKind, d: PushData, today?: string): string | null {
  const by = clean(d.by, 40);
  const item = clean(d.item, 60);
  switch (kind) {
    case "invite": return by ? `${by} invited you to share.` : null;
    case "accepted": return by ? `${by} accepted your invite.` : null;
    case "shared": return by && item ? `${by} shared ${itemPhrase(d.itemKind, item)} with you.` : by ? `${by} shared something with you.` : null;
    case "unshared": return by && item ? `${by} stopped sharing ${itemPhrase(d.itemKind, item)}.` : by ? `${by} stopped sharing something with you.` : null;
    case "ended": return by ? `${by} ended sharing with you.` : null;
    case "view": return by && item ? `${by} opened ${item}.` : by ? `${by} opened something you shared.` : null;
    case "subscription": {
      const list = (d.subscriptions ?? []).filter((s) => clean(s.name, 40));
      if (!list.length) return null;
      const first = list[0];
      const when = d.days != null ? `${inDays(d.days)}${first.due ? ` (${shortDate(first.due, today)})` : ""}` : first.due ? `on ${shortDate(first.due, today)}` : "soon";
      return list.length === 1 ? `${clean(first.name, 40)} is due ${when}.` : `${clean(first.name, 40)} is due ${when}, and ${list.length - 1} more soon.`;
    }
    case "iptv": {
      const n = d.count ?? 0;
      if (n < 1) return null;
      return `${n} IPTV client${n === 1 ? "" : "s"} expire${n === 1 ? "s" : ""} within 15 days.${d.date ? ` First: ${shortDate(d.date, today)}.` : ""}`;
    }
    case "trip": {
      const name = clean(d.trip, 60);
      if (!name || d.days == null) return null;
      const f = d.flight;
      const flight = f ? ` Flight ${f.number} leaves${f.from ? ` ${f.from}` : ""}${f.time ? ` at ${f.time}` : ""}.` : "";
      return `${name} starts ${inDays(d.days)}${d.date ? ` (${shortDate(d.date, today)})` : ""}.${flight || (d.days >= 2 ? " Check your documents." : "")}`;
    }
    case "flightTomorrow": {
      const f = d.flight;
      return f ? `Flight tomorrow: ${f.number}${route(f) ? ` ${route(f)}` : ""}${f.time ? `, ${f.time}` : ""}.` : null;
    }
    case "afterTrip": return clean(d.trip, 60) ? `${clean(d.trip, 60)} ended. Add your last receipts.` : null;
    case "document": {
      const label = clean(d.label, 30).toLowerCase();
      if (!label || d.days == null) return null;
      const n = d.days;
      const when = n < 0 ? `expired ${-n} day${n === -1 ? "" : "s"} ago` : n === 0 ? "expires today" : n < 90 ? `expires in ${n} day${n === 1 ? "" : "s"}` : `expires in about ${Math.round(n / 30.4)} months`;
      return `Your ${label} ${when}${d.date ? ` (${shortDate(d.date, today)})` : ""}.`;
    }
    case "utility": {
      const names = clean(d.item, 80);
      return names ? `Add this month's bills: ${names}.` : null;
    }
    case "billEmail": {
      const co = clean(d.item, 40);
      if (!co) return null;
      const month = clean(d.label, 20);
      return `New ${co} bill${month ? ` for ${month}` : ""}${d.date ? `, due ${shortDate(d.date, today)}` : ""}.`;
    }
    case "budget": return d.item === "over" ? "You are over this month's budget." : d.item === "near" ? "You have used most of this month's budget." : null;
    case "support": {
      const subject = clean(d.subject, 60);
      return by ? `Support request from ${by}${subject ? `: “${subject}”` : ""}.` : subject ? `Support request: “${subject}”.` : null;
    }
    default: return null; // flight status and the test alert keep their fixed wording
  }
}

export function pushMessage(kind: PushKind, data: PushData | undefined, detail: PushDetail, today?: string): { title: string; body: string } {
  const generic = PUSH_TEXT[kind];
  if (detail === "private" || !data) return { title: generic.title, body: generic.body };
  const body = detailed(kind, data, today);
  return { title: generic.title, body: body ?? generic.body };
}
