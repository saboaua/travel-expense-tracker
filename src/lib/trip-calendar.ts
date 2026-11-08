/**
 * "Add to calendar" for trips: the calendar file (.ics) for Apple / Outlook, the Google Calendar link,
 * and the per-device note that a trip was added. Pure helpers, no browser or server APIs except where noted.
 */

export type CalendarTarget = "apple" | "google" | "ics";
export type Reminder = "none" | "1d" | "3d" | "1w";

export type CalendarTrip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  notes?: string | null;
  updated_at?: string | null;
};

export const REMINDERS: { id: Reminder; label: string }[] = [
  { id: "none", label: "None" },
  { id: "1d", label: "1 day before" },
  { id: "3d", label: "3 days before" },
  { id: "1w", label: "1 week before" },
];

/** All-day events start at midnight, so each reminder goes off at 9 AM on the day it names. */
const ALARM_TRIGGER: Record<Exclude<Reminder, "none">, string> = {
  "1d": "-PT15H",
  "3d": "-P2DT15H",
  "1w": "-P6DT15H",
};

export const isReminder = (v: unknown): v is Reminder => v === "none" || v === "1d" || v === "3d" || v === "1w";

const compact = (date: string) => date.replace(/-/g, "");

/** The day after a YYYY-MM-DD date. Calendar all-day events end on the morning after the last day. */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const lastDay = (t: Pick<CalendarTrip, "start_date" | "end_date">) =>
  t.end_date && t.end_date >= t.start_date ? t.end_date : t.start_date;

/** Text values in a calendar file escape backslash, semicolon, comma and line breaks. */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Calendar files keep lines to 75 bytes; longer ones continue on the next line after a space. Never splits a character. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** What goes in the event's notes: the trip's own notes and a link back to it. */
export function eventDetails(trip: CalendarTrip, opts: { details: boolean; link?: string | null }): string {
  if (!opts.details) return "";
  const parts: string[] = [];
  if (trip.notes?.trim()) parts.push(trip.notes.trim());
  if (opts.link) parts.push(`Open in Lifolio: ${opts.link}`);
  return parts.join("\n\n");
}

/**
 * One all-day event covering the trip. The UID stays the same for a trip, and SEQUENCE grows when the trip is edited,
 * so calendars that support it replace the old event instead of adding a second one.
 */
export function buildTripIcs(
  trip: CalendarTrip,
  opts: { reminder: Reminder; details: boolean; link?: string | null; now?: Date }
): string {
  const now = opts.now ?? new Date();
  const updated = trip.updated_at ? Date.parse(trip.updated_at) : NaN;
  const sequence = Number.isFinite(updated) ? Math.max(0, Math.floor(updated / 1000) - 1_700_000_000) : 0;
  const description = eventDetails(trip, opts);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lifolio//Trips//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:trip-${trip.id}@lifolio`,
    `DTSTAMP:${stamp(now)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;VALUE=DATE:${compact(trip.start_date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(lastDay(trip)))}`,
    `SUMMARY:${escapeIcsText(trip.name)}`,
    ...(trip.destination ? [`LOCATION:${escapeIcsText(trip.destination)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    ...(opts.details && opts.link ? [`URL:${opts.link}`] : []),
    "TRANSP:TRANSPARENT",
    ...(opts.reminder !== "none"
      ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcsText(trip.name)}`, `TRIGGER:${ALARM_TRIGGER[opts.reminder]}`, "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Google Calendar's "new event" page, filled in. Google applies the person's own default reminders. */
export function googleCalendarUrl(trip: CalendarTrip, opts: { details: boolean; link?: string | null }): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: trip.name,
    dates: `${compact(trip.start_date)}/${compact(nextDay(lastDay(trip)))}`,
  });
  const details = eventDetails(trip, opts);
  if (details) p.set("details", details);
  if (trip.destination) p.set("location", trip.destination);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Address of the calendar file the server builds for a trip. */
export function icsPath(tripId: string, opts: { reminder: Reminder; details: boolean; download: boolean }): string {
  const p = new URLSearchParams({ reminder: opts.reminder, details: opts.details ? "1" : "0" });
  if (opts.download) p.set("download", "1");
  return `/api/trips/${encodeURIComponent(tripId)}/calendar?${p.toString()}`;
}

/** A safe file name from the trip name: "Winlott Meeting 2026" → "winlott-meeting-2026.ics". */
export function icsFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "trip"}.ics`;
}

export const targetLabel = (t: CalendarTarget, iPhone: boolean) =>
  t === "apple" ? (iPhone ? "iPhone Calendar" : "Apple Calendar") : t === "google" ? "Google Calendar" : "Outlook / other";

/** "Tue, Nov 17 – Fri, Nov 20" (or a single day) for the event preview. */
export function longDateRange(start: string, end: string | null): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const last = end && end > start ? end : null;
  return last ? `${f(start)} – ${f(last)}` : f(start);
}

// ---- The note on this device that a trip was added (the app cannot see into the phone's calendar) ----

export type CalendarMark = {
  target: CalendarTarget;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  at: string;
};

export type MarkState = "none" | "added" | "changed";

/** Added, or added but the trip's name, place or dates have changed since, so the event is out of date. */
export function markState(trip: CalendarTrip, mark: CalendarMark | null | undefined): MarkState {
  if (!mark) return "none";
  const same =
    mark.name === trip.name &&
    (mark.destination ?? null) === (trip.destination ?? null) &&
    mark.start_date === trip.start_date &&
    (mark.end_date ?? null) === (trip.end_date ?? null);
  return same ? "added" : "changed";
}

export const MARK_KEY = (tripId: string) => `trip-calendar:${tripId}`;
export const PREFS_KEY = "trip-calendar:prefs";
export const MARK_EVENT = "trip-calendar-change";

/** Browser only. Never throws: storage can be off or full. */
export function readMark(tripId: string): CalendarMark | null {
  try {
    const raw = localStorage.getItem(MARK_KEY(tripId));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.start_date === "string" && typeof v.name === "string" ? (v as CalendarMark) : null;
  } catch {
    return null;
  }
}

export function writeMark(tripId: string, mark: CalendarMark | null): void {
  try {
    if (mark) localStorage.setItem(MARK_KEY(tripId), JSON.stringify(mark));
    else localStorage.removeItem(MARK_KEY(tripId));
    window.dispatchEvent(new CustomEvent(MARK_EVENT, { detail: tripId }));
  } catch {
    /* the event still went to the calendar; only the note is lost */
  }
}

export type CalendarPrefs = { reminder: Reminder; details: boolean; target: CalendarTarget | null };

export function readPrefs(): CalendarPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    return {
      reminder: isReminder(v?.reminder) ? v.reminder : "1d",
      details: typeof v?.details === "boolean" ? v.details : true,
      target: v?.target === "apple" || v?.target === "google" || v?.target === "ics" ? v.target : null,
    };
  } catch {
    return { reminder: "1d", details: true, target: null };
  }
}

export function writePrefs(p: CalendarPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** The calendar this device most likely uses: iPhone/iPad → Apple, Android → Google, otherwise a file. */
export function guessTarget(userAgent: string, maxTouchPoints = 0): CalendarTarget {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "apple";
  if (/Android/.test(userAgent)) return "google";
  if (/Macintosh/.test(userAgent)) return "apple";
  return "ics";
}
