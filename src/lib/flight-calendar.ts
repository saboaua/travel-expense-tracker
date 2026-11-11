import { clock, shownArrival, shownDeparture, type FlightFields } from "@/lib/flights";
import { escapeIcsText, foldIcsLine } from "@/lib/trip-calendar";

/**
 * "Add to calendar" for one flight: a timed event from departure to arrival.
 * When both airports' UTC offsets are known the event is fixed in time (UTC), so every phone shows the right moment.
 * A flight entered by hand has no offsets: its times are then "floating" local clock times.
 */
export type FlightReminder = "none" | "3h" | "1d";
export const FLIGHT_REMINDERS: { id: FlightReminder; label: string }[] = [
  { id: "none", label: "None" },
  { id: "3h", label: "3 hours before" },
  { id: "1d", label: "1 day before" },
];
export const isFlightReminder = (v: unknown): v is FlightReminder => v === "none" || v === "3h" || v === "1d";
const TRIGGER: Record<Exclude<FlightReminder, "none">, string> = { "3h": "-PT3H", "1d": "-P1D" };

export type CalendarFlight = Pick<FlightFields,
  "flight_number" | "airline" | "dep_iata" | "dep_name" | "dep_city" | "dep_local" | "dep_est_local" | "dep_offset" | "dep_terminal" | "dep_gate" |
  "arr_iata" | "arr_name" | "arr_city" | "arr_local" | "arr_est_local" | "arr_offset" | "arr_terminal" | "arr_gate"> & { id: string; status?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const compactLocal = (local: string) => `${local.slice(0, 10).replace(/-/g, "")}T${local.slice(11, 13)}${local.slice(14, 16)}00`;
const addMinutes = (local: string, min: number) => {
  const d = new Date(Date.parse(`${local}:00Z`) + min * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const toUtc = (local: string, offset: number) => addMinutes(local, -offset);

/** Start and end as calendar stamps, and whether they are fixed in time (UTC) or floating. */
export function flightTimes(f: CalendarFlight): { start: string; end: string; fixed: boolean } | null {
  const dep = shownDeparture(f);
  if (!dep) return null;
  const arr = shownArrival(f);
  const fixed = f.dep_offset != null && (arr == null || f.arr_offset != null);
  if (fixed) {
    const s = toUtc(dep, f.dep_offset as number);
    const e = arr ? toUtc(arr, f.arr_offset as number) : addMinutes(s, 60);
    const end = Date.parse(`${e}:00Z`) > Date.parse(`${s}:00Z`) ? e : addMinutes(s, 60);
    return { start: `${compactLocal(s)}Z`, end: `${compactLocal(end)}Z`, fixed: true };
  }
  const end = arr && Date.parse(`${arr}:00Z`) > Date.parse(`${dep}:00Z`) ? arr : addMinutes(dep, 60);
  return { start: compactLocal(dep), end: compactLocal(end), fixed: false };
}

const place = (iata: string | null, name: string | null, city: string | null) => [name ?? city, iata ? `(${iata})` : ""].filter(Boolean).join(" ");
const when = (local: string | null) => { const c = clock(local); return c ? `${c.time} ${c.period}` : ""; };

export const flightTitle = (f: CalendarFlight) => `${f.flight_number} ${f.dep_iata ?? "?"} to ${f.arr_iata ?? "?"}`;

export function flightDetails(f: CalendarFlight, link?: string | null): string {
  const line = (label: string, iata: string | null, name: string | null, city: string | null, local: string | null, term: string | null, gate: string | null) =>
    `${label}: ${[when(local), place(iata, name, city)].filter(Boolean).join(" ")}${term ? ` · Terminal ${term}` : ""}${gate ? ` · Gate ${gate}` : ""}`;
  return [
    f.airline ? `${f.airline} ${f.flight_number}` : f.flight_number,
    line("Departs", f.dep_iata, f.dep_name, f.dep_city, shownDeparture(f), f.dep_terminal, f.dep_gate),
    line("Arrives", f.arr_iata, f.arr_name, f.arr_city, shownArrival(f), f.arr_terminal, f.arr_gate),
    "Times are local to each airport and can change. Check Lifolio or the airline for the latest.",
    ...(link ? [`Open in Lifolio: ${link}`] : []),
  ].join("\n");
}

export function buildFlightIcs(f: CalendarFlight, opts: { reminder: FlightReminder; link?: string | null; now?: Date }): string | null {
  const t = flightTimes(f);
  if (!t) return null;
  const now = opts.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // Grows over time, so a calendar that already has this flight replaces it when it is added again
  const sequence = Math.max(0, Math.floor(now.getTime() / 1000) - 1_700_000_000);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lifolio//Flights//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:flight-${f.id}@lifolio`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${t.start}`,
    `DTEND:${t.end}`,
    `SUMMARY:${escapeIcsText(flightTitle(f))}`,
    ...(place(f.dep_iata, f.dep_name, f.dep_city) ? [`LOCATION:${escapeIcsText(place(f.dep_iata, f.dep_name, f.dep_city) + (f.dep_terminal ? ` Terminal ${f.dep_terminal}` : ""))}`] : []),
    `DESCRIPTION:${escapeIcsText(flightDetails(f, opts.link))}`,
    ...(opts.link ? [`URL:${opts.link}`] : []),
    "TRANSP:OPAQUE",
    ...(opts.reminder !== "none" ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcsText(flightTitle(f))}`, `TRIGGER:${TRIGGER[opts.reminder]}`, "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function googleFlightUrl(f: CalendarFlight, link?: string | null): string | null {
  const t = flightTimes(f);
  if (!t) return null;
  const p = new URLSearchParams({ action: "TEMPLATE", text: flightTitle(f), dates: `${t.start}/${t.end}`, details: flightDetails(f, link) });
  const loc = place(f.dep_iata, f.dep_name, f.dep_city);
  if (loc) p.set("location", loc);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const flightIcsPath = (flightId: string, opts: { reminder: FlightReminder; download: boolean }) =>
  `/api/flights/${encodeURIComponent(flightId)}/calendar?reminder=${opts.reminder}${opts.download ? "&download=1" : ""}`;

export const flightIcsName = (f: CalendarFlight) => `${f.flight_number.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${(f.dep_iata ?? "").toLowerCase()}-${(f.arr_iata ?? "").toLowerCase()}.ics`.replace(/-+/g, "-");
