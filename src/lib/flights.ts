/**
 * Flights on a trip: reading what a flight-data service (AeroDataBox) or a scanned ticket says, and showing it.
 *
 * Times are kept as the local wall-clock time at each airport, exactly what a boarding pass shows ("2026-11-17T09:45"),
 * plus the airport's UTC offset in minutes when it is known. That keeps the screen simple (no time-zone maths to show a
 * time) and still lets the flight length and the "1 hour behind" note be worked out.
 */

export type FlightLeg = "outbound" | "return" | "connection";
export const FLIGHT_LEGS: { id: FlightLeg; label: string }[] = [
  { id: "outbound", label: "Outbound" },
  { id: "return", label: "Return" },
  { id: "connection", label: "Connection" },
];
export type FlightStatus = "scheduled" | "delayed" | "boarding" | "departed" | "landed" | "cancelled" | "diverted" | "unknown";
export type FlightSource = "auto" | "manual";

/** What a lookup, a scan or the manual form produces. */
export interface FlightFields {
  flight_number: string;
  airline: string | null;
  aircraft: string | null;
  flight_date: string;
  dep_iata: string | null;
  dep_city: string | null;
  dep_name: string | null;
  dep_local: string | null;
  dep_est_local: string | null;
  dep_offset: number | null;
  dep_terminal: string | null;
  dep_gate: string | null;
  arr_iata: string | null;
  arr_city: string | null;
  arr_name: string | null;
  arr_local: string | null;
  arr_est_local: string | null;
  arr_offset: number | null;
  arr_terminal: string | null;
  arr_gate: string | null;
  status: FlightStatus;
}

export interface TripFlight extends FlightFields {
  id: string;
  trip_id: string;
  leg: FlightLeg;
  pnr: string | null;
  seat: string | null;
  cabin: string | null;
  source: FlightSource;
  alerts: boolean;
  last_synced_at: string | null;
}

/* ---------------- flight number ---------------- */

/** "cm 312", "CM-312", "cm0312" -> { code: "CM", number: "312", compact: "CM312", display: "CM 312" }. */
export function parseFlightNumber(input: string): { code: string; number: string; compact: string; display: string } | null {
  const t = String(input ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
  const m = t.match(/^([A-Z0-9]{2,3}?)(\d{1,4}[A-Z]?)$/);
  if (!m) return null;
  // Airline codes are 2 letters/digits (IATA) or 3 letters (ICAO): prefer 2 unless the text only fits as 3 letters
  let code = m[1];
  let rest = m[2];
  const three = t.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (code.length === 3 && !three) return null;
  if (code.length === 2 && three && /^[A-Z]{2}[A-Z]/.test(t) && !/^\d/.test(rest)) { code = three[1]; rest = three[2]; }
  const number = rest.replace(/^0+(?=\d)/, "");
  return { code, number, compact: `${code}${number}`, display: `${code} ${number}` };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDay = (s: unknown): s is string => typeof s === "string" && ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/* ---------------- reading AeroDataBox ---------------- */

/** "2026-11-17 09:45-04:00" -> { local: "2026-11-17T09:45", offset: -240 }. */
export function parseStamp(raw: unknown): { local: string; offset: number | null } | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  let offset: number | null = null;
  if (m[3]) {
    if (m[3] === "Z") offset = 0;
    else {
      const sign = m[3][0] === "-" ? -1 : 1;
      const digits = m[3].slice(1).replace(":", "");
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
  }
  return { local: `${m[1]}T${m[2]}`, offset };
}

const str = (v: unknown, max = 80): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const iata = (v: unknown): string | null => {
  const t = str(v, 4)?.toUpperCase() ?? null;
  return t && /^[A-Z0-9]{3,4}$/.test(t) ? t : null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/** The service's own words for the state of the flight, as ours. */
export function statusFromService(raw: unknown, delay: number): FlightStatus {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "canceled" || s === "cancelled" || s === "canceleduncertain") return "cancelled";
  if (s === "diverted") return "diverted";
  if (s === "arrived") return "landed";
  if (s === "departed" || s === "enroute" || s === "approaching") return "departed";
  if (s === "boarding" || s === "gateclosed") return "boarding";
  if (s === "delayed") return "delayed";
  if (s === "expected" || s === "checkin" || s === "scheduled") return delay >= 15 ? "delayed" : "scheduled";
  return delay >= 15 ? "delayed" : "unknown";
}

const minutesBetween = (a: string | null, b: string | null): number => {
  if (!a || !b) return 0;
  return Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000);
};

/** One flight from AeroDataBox's "flights by number and date" answer (a list; the one leaving on `date` is used). */
export function fromAeroDataBox(json: unknown, date: string): FlightFields | null {
  const list = (Array.isArray(json) ? json : json ? [json] : []) as Obj[];
  const pick =
    list.find((f) => parseStamp(obj(obj(f.departure).scheduledTime).local ?? obj(obj(f.departure).scheduledTime).utc)?.local.startsWith(date)) ?? list[0];
  if (!pick) return null;
  const dep = obj(pick.departure);
  const arr = obj(pick.arrival);
  const depPlace = obj(dep.airport);
  const arrPlace = obj(arr.airport);
  const depSched = parseStamp(obj(dep.scheduledTime).local);
  const arrSched = parseStamp(obj(arr.scheduledTime).local);
  const depRev = parseStamp(obj(dep.revisedTime).local) ?? parseStamp(obj(dep.predictedTime).local);
  const arrRev = parseStamp(obj(arr.revisedTime).local) ?? parseStamp(obj(arr.predictedTime).local);
  const number = parseFlightNumber(String(pick.number ?? ""));
  if (!number || !depSched) return null;
  const delay = minutesBetween(depSched.local, depRev?.local ?? null);
  return {
    flight_number: number.display,
    airline: str(obj(pick.airline).name),
    aircraft: str(obj(pick.aircraft).model),
    flight_date: depSched.local.slice(0, 10),
    dep_iata: iata(depPlace.iata),
    dep_city: str(depPlace.municipalityName),
    dep_name: str(depPlace.shortName) ?? str(depPlace.name),
    dep_local: depSched.local,
    dep_est_local: depRev && depRev.local !== depSched.local ? depRev.local : null,
    dep_offset: depSched.offset,
    dep_terminal: str(dep.terminal, 12),
    dep_gate: str(dep.gate, 12),
    arr_iata: iata(arrPlace.iata),
    arr_city: str(arrPlace.municipalityName),
    arr_name: str(arrPlace.shortName) ?? str(arrPlace.name),
    arr_local: arrSched?.local ?? null,
    arr_est_local: arrRev && arrRev.local !== arrSched?.local ? arrRev.local : null,
    arr_offset: arrSched?.offset ?? null,
    arr_terminal: str(arr.terminal, 12),
    arr_gate: str(arr.gate, 12),
    status: statusFromService(pick.status, delay),
  };
}

/* ---------------- reading a scanned ticket or boarding pass ---------------- */

export interface FlightScan {
  flight_number: string | null;
  flight_date: string | null;
  dep_iata: string | null;
  arr_iata: string | null;
  pnr: string | null;
  seat: string | null;
  cabin: string | null;
  passenger: string | null;
}

/** What the AI read from the image, cleaned. Only what is listed is kept; anything else it returned is dropped. */
export function sanitizeFlightScan(raw: unknown, today: string): FlightScan {
  const r = obj(raw);
  const num = parseFlightNumber(String(r.flight_number ?? ""));
  const date = typeof r.flight_date === "string" && isIsoDay(r.flight_date) ? r.flight_date : null;
  const pnr = str(r.pnr, 10)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
  const seat = str(r.seat, 4)?.toUpperCase().replace(/^0+(?=\d)/, "") ?? null;
  const cabinRaw = str(r.cabin, 30);
  void today;
  return {
    flight_number: num?.display ?? null,
    flight_date: date,
    dep_iata: iata(r.dep_iata),
    arr_iata: iata(r.arr_iata),
    pnr: pnr && pnr.length >= 5 && pnr.length <= 8 ? pnr : null,
    seat: seat && /^\d{1,2}[A-Z]$/.test(seat) ? seat : null,
    cabin: cabinRaw ? cabinRaw.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    passenger: null, // the name is never kept
  };
}

/* ---------------- the form (manual entry) ---------------- */

export interface ManualFlightInput {
  flight_number: string;
  airline?: string;
  flight_date: string;
  dep_iata: string;
  arr_iata: string;
  dep_time: string; // HH:MM
  arr_time: string; // HH:MM
  arr_date?: string; // defaults to the departure day
}

/** Turns the manual form into the fields of a flight, or says what is wrong. */
export function manualFlight(input: ManualFlightInput): { ok: true; fields: FlightFields } | { ok: false; error: string } {
  const num = parseFlightNumber(input.flight_number);
  if (!num) return { ok: false, error: "Enter the flight number, like CM 312." };
  if (!isIsoDay(input.flight_date)) return { ok: false, error: "Choose the flight date." };
  const from = iata(input.dep_iata);
  const to = iata(input.arr_iata);
  if (!from || !to) return { ok: false, error: "Enter the airport codes, like AUA and PTY." };
  if (from === to) return { ok: false, error: "The two airports are the same." };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(input.dep_time) || !time.test(input.arr_time)) return { ok: false, error: "Enter the times as hours and minutes, like 09:45." };
  const arrDate = input.arr_date && isIsoDay(input.arr_date) ? input.arr_date : input.flight_date;
  return {
    ok: true,
    fields: {
      flight_number: num.display,
      airline: str(input.airline) ,
      aircraft: null,
      flight_date: input.flight_date,
      dep_iata: from,
      dep_city: null,
      dep_name: null,
      dep_local: `${input.flight_date}T${input.dep_time}`,
      dep_est_local: null,
      dep_offset: null,
      dep_terminal: null,
      dep_gate: null,
      arr_iata: to,
      arr_city: null,
      arr_name: null,
      arr_local: `${arrDate}T${input.arr_time}`,
      arr_est_local: null,
      arr_offset: null,
      arr_terminal: null,
      arr_gate: null,
      status: "scheduled",
    },
  };
}

/* ---------------- showing a flight ---------------- */

/** "2026-11-17T09:45" -> { time: "09:45", period: "AM", hour24: ... } as a boarding pass shows it. */
export function clock(local: string | null): { time: string; period: "AM" | "PM" } | null {
  const m = local?.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return { time: `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${m[2]}`, period: h < 12 ? "AM" : "PM" };
}

/** The time to show: the revised one when the service has one. */
export const shownDeparture = (f: Pick<TripFlight, "dep_local" | "dep_est_local">) => f.dep_est_local ?? f.dep_local;
export const shownArrival = (f: Pick<TripFlight, "arr_local" | "arr_est_local">) => f.arr_est_local ?? f.arr_local;

/** Minutes the departure is late by (0 when on time or unknown). */
export function delayMinutes(f: Pick<TripFlight, "dep_local" | "dep_est_local">): number {
  return Math.max(0, minutesBetween(f.dep_local, f.dep_est_local));
}

/** Flight length in minutes, when both airports' offsets are known. */
export function durationMinutes(f: Pick<TripFlight, "dep_local" | "dep_offset" | "arr_local" | "arr_offset">): number | null {
  if (!f.dep_local || !f.arr_local || f.dep_offset == null || f.arr_offset == null) return null;
  const mins = minutesBetween(f.dep_local, f.arr_local) - (f.arr_offset - f.dep_offset);
  return mins > 0 && mins < 24 * 60 ? mins : null;
}

export function durationText(mins: number | null): string | null {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** Days after the departure day that the plane lands (0, or 1 for "+1"); negative for a westward flight that lands "the day before". */
export function arrivalDayOffset(f: Pick<TripFlight, "dep_local" | "arr_local">): number {
  if (!f.dep_local || !f.arr_local) return 0;
  return Math.round((Date.parse(`${f.arr_local.slice(0, 10)}T00:00:00Z`) - Date.parse(`${f.dep_local.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

/** "Local times at each airport. Panama City is 1 hour behind Oranjestad." (only when both offsets are known and differ) */
export function zoneNote(f: Pick<TripFlight, "dep_offset" | "arr_offset" | "dep_city" | "arr_city" | "dep_iata" | "arr_iata">): string {
  const base = "Local times at each airport.";
  if (f.dep_offset == null || f.arr_offset == null || f.dep_offset === f.arr_offset) return base;
  const diff = f.arr_offset - f.dep_offset;
  const hours = Math.abs(diff) / 60;
  const n = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${base} ${f.arr_city || f.arr_iata || "Arrival"} is ${n} hour${hours === 1 ? "" : "s"} ${diff < 0 ? "behind" : "ahead of"} ${f.dep_city || f.dep_iata || "departure"}.`.replace("ahead of ahead of", "ahead of");
}

export type StatusTone = "ok" | "warn" | "bad" | "info" | "muted";
export function statusView(f: Pick<TripFlight, "status" | "source" | "dep_local" | "dep_est_local">): { label: string; tone: StatusTone } {
  const late = delayMinutes(f);
  switch (f.status) {
    case "cancelled": return { label: "Cancelled", tone: "bad" };
    case "diverted": return { label: "Diverted", tone: "bad" };
    case "landed": return { label: "Landed", tone: "muted" };
    case "departed": return { label: "In the air", tone: "info" };
    case "boarding": return { label: "Boarding", tone: "info" };
    case "delayed": return { label: late >= 15 ? `Delayed ${late} min` : "Delayed", tone: "warn" };
    default:
      if (f.source === "manual") return { label: "Scheduled", tone: "muted" };
      return late >= 15 ? { label: `Delayed ${late} min`, tone: "warn" } : { label: "On time", tone: "ok" };
  }
}

/** "WK89L2" -> "••••L2" */
export const maskPnr = (pnr: string | null) => (pnr ? `••••${pnr.slice(-2)}` : "");

/* ---------------- keeping it up to date ---------------- */

const HOUR = 3600_000;
/** The flight's departure as a point in time (needs the offset; otherwise the wall-clock time read as UTC, which is good enough for "is it soon"). */
export function departureMs(f: Pick<TripFlight, "dep_local" | "dep_offset" | "flight_date">): number {
  const local = f.dep_local ?? `${f.flight_date}T12:00`;
  return Date.parse(`${local}:00Z`) - (f.dep_offset ?? 0) * 60000;
}

/** A flight from the service is worth asking about again when it is close (from 2 days before until it lands) and the last answer is older than 10 minutes. */
export function needsRefresh(f: Pick<TripFlight, "source" | "status" | "dep_local" | "dep_offset" | "flight_date" | "last_synced_at">, now: number): boolean {
  if (f.source !== "auto" || f.status === "landed" || f.status === "cancelled") return false;
  const dep = departureMs(f);
  if (dep - now > 48 * HOUR || now - dep > 14 * HOUR) return false;
  return !f.last_synced_at || now - Date.parse(f.last_synced_at) > 10 * 60_000;
}

/** What an alert is about: changes when the status, the delay, the gate or the terminal changes. */
export const changeKey = (f: Pick<TripFlight, "status" | "dep_est_local" | "dep_gate" | "dep_terminal">) =>
  [f.status, f.dep_est_local ?? "", f.dep_gate ?? "", f.dep_terminal ?? ""].join("|");

/** Soonest flight that has not landed, for the line on a trip card. */
export function nextFlight<T extends Pick<TripFlight, "status" | "dep_local" | "dep_offset" | "flight_date">>(flights: T[], now: number): T | null {
  const open = flights.filter((f) => f.status !== "landed" && f.status !== "cancelled" && departureMs(f) > now - 6 * HOUR);
  const pool = open.length ? open : flights;
  return [...pool].sort((a, b) => departureMs(a) - departureMs(b))[0] ?? null;
}

const LEG_ORDER: Record<FlightLeg, number> = { outbound: 0, connection: 1, return: 2 };
export const sortFlights = <T extends Pick<TripFlight, "leg" | "dep_local" | "dep_offset" | "flight_date">>(list: T[]): T[] =>
  [...list].sort((a, b) => departureMs(a) - departureMs(b) || LEG_ORDER[a.leg] - LEG_ORDER[b.leg]);

export const flightSummary = (f: Pick<TripFlight, "flight_number" | "dep_iata" | "arr_iata" | "dep_local" | "dep_est_local">) => {
  const c = clock(shownDeparture(f));
  return `${f.flight_number} · ${f.dep_iata ?? "?"} to ${f.arr_iata ?? "?"}${c ? ` · ${c.time} ${c.period}` : ""}`;
};
