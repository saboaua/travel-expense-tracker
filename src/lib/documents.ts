/**
 * Travel document helpers: passport validity rules and renewal reminders.
 * Pure functions (no I/O) so they can be unit-tested.
 *
 * Rule of thumb used by most destinations: the passport must be valid for at least 6 months
 * beyond the day you travel/return. Renewals can take weeks, so we start nudging 3 months earlier.
 */

export type DocKind = "passport" | "visa" | "id" | "ticket" | "booking" | "insurance" | "vaccination" | "other";

export const DOC_KINDS: { value: DocKind; label: string; hasExpiry: boolean }[] = [
  { value: "passport", label: "Passport", hasExpiry: true },
  { value: "visa", label: "Visa / e-visa", hasExpiry: true },
  { value: "id", label: "ID card", hasExpiry: true },
  { value: "ticket", label: "Ticket / boarding pass", hasExpiry: false },
  { value: "booking", label: "Hotel / booking", hasExpiry: false },
  { value: "insurance", label: "Travel insurance", hasExpiry: true },
  { value: "vaccination", label: "Vaccination record", hasExpiry: true },
  { value: "other", label: "Other", hasExpiry: false },
];

export const kindLabel = (k: string) => DOC_KINDS.find((d) => d.value === k)?.label ?? "Document";
export const kindHasExpiry = (k: string) => DOC_KINDS.find((d) => d.value === k)?.hasExpiry ?? false;

export type TravelDocument = {
  id: string;
  user_id: string;
  trip_id: string | null;
  kind: DocKind;
  title: string;
  document_number?: string | null;
  issuing_country: string | null;
  expiry_date: string | null;
  notes: string | null;
  file_path: string | null;
  created_at: string;
};

const REQUIRED_VALIDITY_MONTHS = 6;
const RENEWAL_LEAD_MONTHS = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY = 86_400_000;

/** Whole days from a to b (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** ISO date + n months, clamped to the last day of the target month (31 Aug + 6m = 28 Feb). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type PassportLevel = "expired" | "critical" | "renew" | "ok";

type PassportStatus = {
  level: PassportLevel;
  daysLeft: number;
  /** Date you should have started renewing by */
  renewBy: string;
  /** Last day on which the passport still meets the 6-month rule */
  validForEntryUntil: string;
  title: string;
  message: string;
};

export function passportStatus(
  expiry: string,
  today: string,
  opts: { requiredMonths?: number; leadMonths?: number } = {}
): PassportStatus | null {
  if (!ISO.test(expiry) || !ISO.test(today)) return null;
  const required = opts.requiredMonths ?? REQUIRED_VALIDITY_MONTHS;
  const lead = opts.leadMonths ?? RENEWAL_LEAD_MONTHS;
  const daysLeft = dayDiff(today, expiry);
  const renewBy = addMonths(expiry, -(required + lead));
  const validForEntryUntil = addMonths(expiry, -required);

  let level: PassportLevel = "ok";
  if (daysLeft < 0) level = "expired";
  else if (today > validForEntryUntil) level = "critical";
  else if (today > renewBy) level = "renew";

  const messages: Record<PassportLevel, [string, string]> = {
    expired: ["Your passport has expired", "Renew it before booking any trip."],
    critical: ["Renew your passport now", `It has less than ${required} months left, which many destinations will not accept for entry.`],
    renew: ["Time to renew your passport", `Most destinations want ${required}+ months of validity. Renewals can take weeks, so start soon.`],
    ok: ["Passport is valid", `Valid for entry to most destinations until ${validForEntryUntil}.`],
  };
  return { level, daysLeft, renewBy, validForEntryUntil, title: messages[level][0], message: messages[level][1] };
}

type TripPassportCheck = { ok: boolean; mustBeValidUntil: string; shortByDays: number; expiredBeforeTrip: boolean };

/** Does this passport cover a trip that ends on `tripEnd`, with the usual 6-month buffer? */
export function tripPassportCheck(expiry: string, tripEnd: string, requiredMonths = REQUIRED_VALIDITY_MONTHS): TripPassportCheck | null {
  if (!ISO.test(expiry) || !ISO.test(tripEnd)) return null;
  const mustBeValidUntil = addMonths(tripEnd, requiredMonths);
  const shortByDays = Math.max(0, dayDiff(expiry, mustBeValidUntil));
  return { ok: expiry >= mustBeValidUntil, mustBeValidUntil, shortByDays, expiredBeforeTrip: expiry < tripEnd };
}

/** With several passports on file, the one that stays valid longest is the one that matters. */
export function currentPassport<T extends { kind: string; expiry_date: string | null }>(docs: T[]): T | null {
  const list = docs.filter((d) => d.kind === "passport" && d.expiry_date);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => (b.expiry_date as string).localeCompare(a.expiry_date as string))[0];
}

export type RenewalAlert = {
  level: Exclude<PassportLevel, "ok">;
  title: string;
  message: string;
  expiry: string;
  /** Soonest trip the passport does not cover, if any */
  tripConflict: { tripName: string; mustBeValidUntil: string } | null;
};

/**
 * What the dashboard balloon should say, or null when there is nothing to worry about.
 * A passport that is fine today can still be too short for a planned trip, so trips are checked too.
 */
export function renewalAlert(
  passport: { expiry_date: string | null } | null,
  trips: { name: string; start_date: string; end_date: string | null; status: string }[],
  today: string
): RenewalAlert | null {
  const expiry = passport?.expiry_date;
  if (!expiry) return null;
  const status = passportStatus(expiry, today);
  if (!status) return null;

  const upcoming = trips
    .filter((t) => t.status === "active" && (t.end_date || t.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  let conflict: RenewalAlert["tripConflict"] = null;
  for (const t of upcoming) {
    const c = tripPassportCheck(expiry, t.end_date || t.start_date);
    if (c && !c.ok) {
      conflict = { tripName: t.name, mustBeValidUntil: c.mustBeValidUntil };
      break;
    }
  }

  if (status.level === "ok") {
    if (!conflict) return null;
    return {
      level: "renew",
      title: "Your passport may be too short for a trip",
      message: `${conflict.tripName} needs a passport valid until ${conflict.mustBeValidUntil}. Yours expires ${expiry}.`,
      expiry,
      tripConflict: conflict,
    };
  }
  return { level: status.level, title: status.title, message: status.message, expiry, tripConflict: conflict };
}

/** "AB123456" -> "••••3456" so the number is not shown on screen by default. */
export function maskNumber(n: string): string {
  const t = n.trim();
  if (t.length <= 4) return "••••";
  return `••••${t.slice(-4)}`;
}

/** What a stored file is, from its path: used to pick the right viewer. */
export function fileKind(path: string | null | undefined): "pdf" | "image" | "other" {
  const ext = (path || "").toLowerCase().split("?")[0].split(".").pop() || "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "other";
}
