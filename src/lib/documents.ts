/**
 * Travel document helpers: passport validity rules and renewal reminders.
 * Pure functions (no I/O) so they can be unit-tested.
 *
 * Rule of thumb used by most destinations: the passport must be valid for at least 6 months
 * beyond the day you travel/return. Renewals can take weeks, so we start nudging 3 months earlier.
 */

export type DocKind = "passport" | "visa" | "id" | "license" | "ticket" | "booking" | "insurance" | "vaccination" | "other";

export const DOC_KINDS: { value: DocKind; label: string; hasExpiry: boolean }[] = [
  { value: "passport", label: "Passport", hasExpiry: true },
  { value: "visa", label: "Visa / e-visa", hasExpiry: true },
  { value: "id", label: "ID card", hasExpiry: true },
  { value: "license", label: "Driver's license", hasExpiry: true },
  { value: "ticket", label: "Ticket / boarding pass", hasExpiry: false },
  { value: "booking", label: "Hotel / booking", hasExpiry: false },
  { value: "insurance", label: "Travel insurance", hasExpiry: true },
  { value: "vaccination", label: "Vaccination record", hasExpiry: true },
  { value: "other", label: "Other", hasExpiry: false },
];

export const kindLabel = (k: string) => DOC_KINDS.find((d) => d.value === k)?.label ?? "Document";
export const kindHasExpiry = (k: string) => DOC_KINDS.find((d) => d.value === k)?.hasExpiry ?? false;

/** Which home dashboard lists a document. Older databases have no column, which means both. */
export type DocScope = "personal" | "business" | "both";
export const DOC_SCOPES: { value: DocScope; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
  { value: "both", label: "Both" },
];
export const docScope = (d: { show_on?: string | null }): DocScope => (d.show_on === "personal" || d.show_on === "business" ? d.show_on : "both");
/** True when the document belongs on that dashboard. */
export const showsOn = (d: { show_on?: string | null }, view: "personal" | "business"): boolean => {
  const s = docScope(d);
  return s === "both" || s === view;
};

export type TravelDocument = {
  id: string;
  user_id: string;
  trip_id: string | null;
  kind: DocKind;
  title: string;
  document_number?: string | null;
  show_on?: DocScope | null;
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

/* ---------- tiles on the business page ---------- */

export type DocLevel = "ok" | "soon" | "critical" | "expired" | "none";

/** Days before expiry when a non-passport document starts showing "Expires soon". */
const SOON_DAYS = 60;

/**
 * The status label for a document tile. Passports follow the 6-month rule used by the renewal banner; everything
 * else is simply valid, expiring within 60 days, or expired. Documents with no expiry date show no status.
 */
export function documentStatus(kind: string, expiry: string | null, today: string): { level: DocLevel; label: string; detail: string } {
  if (!expiry || !ISO.test(expiry)) return { level: "none", label: "", detail: "No expiry date" };
  const daysLeft = dayDiff(today, expiry);
  if (daysLeft < 0) return { level: "expired", label: "Expired", detail: `Expired ${expiry}` };
  if (kind === "passport") {
    const p = passportStatus(expiry, today);
    if (!p) return { level: "ok", label: "Valid", detail: `Expires ${expiry}` };
    if (p.level === "critical") return { level: "critical", label: "Renew now", detail: `Expires ${expiry}` };
    if (p.level === "renew") return { level: "soon", label: "Renew soon", detail: `Expires ${expiry}` };
    return { level: "ok", label: "Valid", detail: `Expires ${expiry}` };
  }
  if (daysLeft <= SOON_DAYS) return { level: "soon", label: "Expires soon", detail: `Expires ${expiry}` };
  return { level: "ok", label: "Valid", detail: `Expires ${expiry}` };
}

/** Order for the tiles: expired and soonest-to-expire first, documents without an expiry last. */
export function sortForTiles<T extends { expiry_date: string | null; created_at?: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    if (a.expiry_date && b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date);
    if (a.expiry_date) return -1;
    if (b.expiry_date) return 1;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

/* ---------- expiry bar on the Documents page ---------- */

export type ExpiryMeter = { level: DocLevel; label: string; /** 0-100: how much validity is left on the bar */ pct: number; daysLeft: number; caption: string };

/** A bar full at this many days left (or more). Passports are valid for years, so their bar scale is longer. */
const meterHorizon = (kind: string) => (kind === "passport" ? 730 : 180);

/**
 * What the expiry bar shows: the colour and label come from the same status as the dashboard tiles, the bar length is
 * the time left on a fixed scale (so a document nearing its end shows a short bar), and the caption says it in words.
 * Null for documents that do not expire.
 */
export function expiryMeter(kind: string, expiry: string | null, today: string): ExpiryMeter | null {
  if (!expiry || !ISO.test(expiry) || !kindHasExpiry(kind)) return null;
  const st = documentStatus(kind, expiry, today);
  const daysLeft = dayDiff(today, expiry);
  const pct = daysLeft <= 0 ? 0 : Math.max(4, Math.min(100, Math.round((daysLeft / meterHorizon(kind)) * 100)));
  let caption: string;
  if (daysLeft < 0) caption = `Expired ${-daysLeft} ${-daysLeft === 1 ? "day" : "days"} ago`;
  else if (daysLeft === 0) caption = "Expires today";
  else if (daysLeft < 90) caption = `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
  else if (daysLeft < 730) caption = `${Math.round(daysLeft / 30.4)} months left`;
  else caption = `${Math.floor(daysLeft / 365)} years left`;
  if (kind === "passport" && daysLeft >= 0 && (st.level === "soon" || st.level === "critical")) caption += " · renew before travelling";
  return { level: st.level, label: st.label, pct, daysLeft, caption };
}

/** What the number on a document is called on its tile. */
export function numberLabel(kind: string): string {
  switch (kind) {
    case "visa": return "Application ID";
    case "license": return "License No.";
    case "ticket": return "Booking ref";
    case "booking": return "Confirmation";
    case "insurance": return "Policy No.";
    default: return "Document No.";
  }
}

/** "20 days left" for the tile's expiry line, only when the end is near; null otherwise (and for expired documents). */
export function tileCountdown(kind: string, expiry: string | null, today: string): string | null {
  const m = expiryMeter(kind, expiry, today);
  if (!m || m.daysLeft < 0 || m.daysLeft > 90) return null;
  return m.daysLeft === 0 ? "today" : `${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"}`;
}
