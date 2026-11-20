/**
 * The Aruba re-entry (ED) card helper. The app never fills or submits the card: it keeps the person's details, works out
 * the answers in the order edcardaruba.aw asks them, and tracks whether the card is done. Pure functions, so the trip page,
 * the answers screen and the phone reminder agree, and they can be tested.
 */
import { addDaysISO } from "@/lib/utils";

export const ENTRY_CARD_URL = "https://edcardaruba.aw/form";
export const ENTRY_CARD_TITLE = "Aruba re-entry card";
export const DETAILS_COLS = "last_name, first_name, passport_number, nationality, birth_date, gender, birth_country, email";
/** The days before the flight the phone reminders go out. */
export const ENTRY_REMIND_DAYS = [5, 2] as const;
/** From this many days before the flight the card turns red when it is not done. */
export const RED_FROM_DAYS = 2;

export type EntryDetails = { last_name: string; first_name: string; passport_number: string; nationality: string; birth_date: string; gender: string; birth_country: string; email: string };
export const EMPTY_DETAILS: EntryDetails = { last_name: "", first_name: "", passport_number: "", nationality: "", birth_date: "", gender: "", birth_country: "", email: "" };
export const GENDERS = ["Male", "Female"] as const;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Reads what the form sends or the database returns. Passport numbers are kept in capitals without spaces. */
export function cleanDetails(input: Partial<Record<keyof EntryDetails, unknown>> | null | undefined): EntryDetails {
  const x = input ?? {};
  const day = clean(x.birth_date, 10);
  return {
    last_name: clean(x.last_name, 80),
    first_name: clean(x.first_name, 80),
    passport_number: clean(x.passport_number, 20).replace(/\s+/g, "").toUpperCase(),
    nationality: clean(x.nationality, 60),
    birth_date: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
    gender: (GENDERS as readonly string[]).includes(clean(x.gender, 10)) ? clean(x.gender, 10) : "",
    birth_country: clean(x.birth_country, 60),
    email: clean(x.email, 120).toLowerCase(),
  };
}

export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

const FIELD_LABEL: Record<keyof EntryDetails, string> = { last_name: "last name", first_name: "first name", passport_number: "passport number", nationality: "nationality", birth_date: "date of birth", gender: "gender", birth_country: "country of birth", email: "email address" };

/** What the card needs that is still empty, in the words shown to the person. */
export function missingDetails(d: EntryDetails, passportExpiry: string | null): string[] {
  const out = (Object.keys(FIELD_LABEL) as (keyof EntryDetails)[]).filter((k) => (k === "email" ? !validEmail(d[k]) : !d[k])).map((k) => FIELD_LABEL[k]);
  if (!passportExpiry) out.push("passport expiry date (add your passport in Documents)");
  return out;
}

/** A flight that brings the person home to Aruba: the last flight of the trip landing at AUA (or a return leg), else null. */
type FlightLite = { flight_number: string; airline: string | null; flight_date: string; leg?: string | null; dep_iata: string | null; dep_city: string | null; dep_name?: string | null; dep_local: string | null; arr_iata: string | null; status?: string | null };
export function homeFlight<T extends FlightLite>(flights: T[]): T | null {
  const live = flights.filter((f) => f.status !== "cancelled");
  const home = live.filter((f) => (f.arr_iata ?? "").toUpperCase() === "AUA");
  const pool = home.length ? home : [];
  if (!pool.length) return null;
  return [...pool].sort((a, b) => (b.dep_local ?? b.flight_date).localeCompare(a.dep_local ?? a.flight_date))[0];
}

/** IATA airline codes the card's airline list is likely to hold. The card site uses names, so a code is turned into one. */
const AIRLINES: Record<string, string> = {
  CM: "Copa Airlines", AA: "American Airlines", UA: "United Airlines", DL: "Delta Air Lines", B6: "JetBlue", AV: "Avianca", KL: "KLM Royal Dutch Airlines", WN: "Southwest Airlines",
  TB: "TUI fly Belgium", OR: "TUI fly Netherlands", EA: "EZ Air", "3K": "Jetstar Asia", F9: "Frontier Airlines", NK: "Spirit Airlines", AC: "Air Canada", WS: "WestJet", TK: "Turkish Airlines",
  QR: "Qatar Airways", EK: "Emirates", LH: "Lufthansa", AF: "Air France", BA: "British Airways", IB: "Iberia", SV: "Saudia", JJ: "LATAM Brasil", LA: "LATAM Airlines",
};
export const airlineName = (code: string, fallback: string | null): string => AIRLINES[code.toUpperCase()] ?? (fallback ?? "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-24" -> "24 Nov 2026". The card's date pickers read day, month, year. */
export function shortDate(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}

export type AnswerRow = { id: string; label: string; value: string; secret?: boolean; missing?: boolean };
export type AnswerSection = { id: string; title: string; rows: AnswerRow[]; manual?: boolean };

/** Every answer in the order edcardaruba.aw asks, for a resident of Aruba coming home by air. */
export function buildAnswers(d: EntryDetails, passportExpiry: string | null, flight: FlightLite | null, arrivalDay: string | null, departureCountry: string | null): AnswerSection[] {
  const row = (id: string, label: string, value: string, secret = false): AnswerRow => ({ id, label, value, secret, missing: !value });
  const parsed = flight ? flight.flight_number.toUpperCase().match(/^([A-Z0-9]{2,3}?)\s*0*(\d{1,4}[A-Z]?)$/) : null;
  const code = parsed?.[1] ?? "";
  return [
    { id: "start", title: "Start", rows: [row("arrival", "Arrival date", shortDate(arrivalDay)), row("resident", "Are you a resident of Aruba?", "Yes")] },
    { id: "passport", title: "Passport details", rows: [
      row("passport", "Passport number", d.passport_number, true), row("expiry", "Passport expiration date", shortDate(passportExpiry)),
      row("last", "Last name(s)", d.last_name), row("first", "First name(s)", d.first_name), row("nat", "Nationality", d.nationality),
      row("dob", "Date of birth", shortDate(d.birth_date)), row("gender", "Gender", d.gender), row("bc", "Country of birth", d.birth_country),
    ] },
    { id: "arrival", title: "Arrival details", rows: [
      row("from", "Country of departure", departureCountry ?? ""), row("mode", "Travel mode", flight ? "Air" : ""),
      row("airline", "Airline", flight ? airlineName(code, flight.airline) : ""), row("flight", "Flight number", parsed ? parsed[2] : ""),
    ] },
    { id: "contact", title: "Contact information", rows: [row("email", "Email address", d.email), row("email2", "Confirm email address", d.email)] },
    { id: "review", title: "Review and submit", rows: [], manual: true },
  ];
}

export type EntryState = "green" | "amber" | "red";
export type EntryStatus = { state: EntryState; title: string; sub: string; label: string; missing: string[] };

/**
 * Green only when the person marked it done (or kept the confirmation in the trip's papers). Red from 2 days before the flight, or
 * when a detail the card needs is missing that close to it. Amber otherwise. `flightDay` is the day of the flight home.
 */
export function entryStatus(o: { today: string; flightDay: string; done: boolean; missing: string[] }): EntryStatus {
  const days = Math.round((Date.parse(`${o.flightDay}T00:00:00Z`) - Date.parse(`${o.today}T00:00:00Z`)) / 86400000);
  if (o.done) return { state: "green", title: ENTRY_CARD_TITLE, sub: "Done", label: "Done", missing: [] };
  if (days < 0) return { state: "red", title: ENTRY_CARD_TITLE, sub: "Not marked done", label: "Not done", missing: o.missing };
  const when = days === 0 ? "you fly today" : days === 1 ? "you fly tomorrow" : `you fly in ${days} days`;
  if (days <= RED_FROM_DAYS) return { state: "red", title: ENTRY_CARD_TITLE, sub: `Not done · ${when}`, label: "Not done", missing: o.missing };
  const opens = days - RED_FROM_DAYS;
  return { state: "amber", title: ENTRY_CARD_TITLE, sub: o.missing.length ? `Add your details · ${when}` : `Ready to fill · turns red in ${opens} day${opens === 1 ? "" : "s"}`, label: "Ready to fill", missing: o.missing };
}

/** Today's reminder step for a flight, or null: 5 and 2 days before, while the card is not done. */
export function entryReminderDue(flightDay: string, today: string, done: boolean): number | null {
  if (done) return null;
  const days = Math.round((Date.parse(`${flightDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return (ENTRY_REMIND_DAYS as readonly number[]).includes(days) ? days : null;
}
export const reminderDaysWindow = (today: string) => ENTRY_REMIND_DAYS.map((d) => addDaysISO(today, d));

/** A paper whose title says it is the card's confirmation counts as done. */
export const isConfirmationPaper = (title: string) => /re-?entry|\bED card\b/i.test(title);
