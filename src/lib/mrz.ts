/**
 * Passport reading helpers.
 *  - parseMrz: reads the two machine-readable lines at the bottom of a passport photo page (ICAO 9303 TD3).
 *    Works offline on OCR text and validates the check digits, so a misread date is rejected instead of trusted.
 *  - sanitizeDocumentFields: makes any extracted values (AI or MRZ) safe to put into the form.
 * The passport number is deliberately never read or returned.
 */
import { DOC_KINDS, type DocKind } from "@/lib/documents";

export type DocumentFields = {
  kind: DocKind | null;
  issuing_country: string | null;
  expiry_date: string | null;
  holder_name: string | null;
};

export type MrzResult = DocumentFields & { kind: "passport"; verified: boolean };

const COUNTRIES: Record<string, string> = {
  ABW: "Aruba", NLD: "Netherlands", CUW: "Curaçao", SXM: "Sint Maarten", USA: "United States", CAN: "Canada", GBR: "United Kingdom",
  VEN: "Venezuela", COL: "Colombia", DOM: "Dominican Republic", BRA: "Brazil", MEX: "Mexico", ARG: "Argentina", CHL: "Chile",
  PER: "Peru", ECU: "Ecuador", PAN: "Panama", CRI: "Costa Rica", JAM: "Jamaica", TTO: "Trinidad and Tobago", HTI: "Haiti",
  CUB: "Cuba", GUY: "Guyana", SUR: "Suriname", FRA: "France", D: "Germany", DEU: "Germany", ESP: "Spain", ITA: "Italy", PRT: "Portugal",
  BEL: "Belgium", CHE: "Switzerland", AUT: "Austria", SWE: "Sweden", NOR: "Norway", DNK: "Denmark", FIN: "Finland", IRL: "Ireland",
  POL: "Poland", GRC: "Greece", TUR: "Türkiye", RUS: "Russia", UKR: "Ukraine", IND: "India", CHN: "China", JPN: "Japan",
  KOR: "South Korea", PHL: "Philippines", AUS: "Australia", NZL: "New Zealand", ZAF: "South Africa", NGA: "Nigeria", EGY: "Egypt",
  MAR: "Morocco", ISR: "Israel", ARE: "United Arab Emirates", SAU: "Saudi Arabia", UTO: "Utopia (sample passport)",
};

const WEIGHTS = [7, 3, 1];
const charValue = (c: string): number => {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return NaN;
};

export function checkDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += charValue(field[i]) * WEIGHTS[i % 3];
  return sum % 10;
}

// OCR often reads digits as letters inside numeric fields
const DIGITISE: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
const digitise = (s: string) => s.replace(/[A-Z]/g, (c) => DIGITISE[c] ?? c);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

function expiryFromYYMMDD(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${2000 + yy}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
}

/** Finds a passport MRZ (2 lines of 44 characters) in OCR text. Returns null when none is found. */
export function parseMrz(text: string): MrzResult | null {
  const lines = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").replace(/[«‹]/g, "<"))
    .filter((l) => l.length >= 40 && /^[A-Z0-9<]+$/.test(l));

  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i];
    if (l1[0] !== "P") continue;
    const pad = (l: string) => l.slice(0, 44).padEnd(44, "<");
    const a = pad(l1);
    const b = pad(lines[i + 1]);

    const expiryRaw = digitise(b.slice(21, 27));
    const expiryCheck = digitise(b[27]);
    const verified = /^\d{6}$/.test(expiryRaw) && /^\d$/.test(expiryCheck) && checkDigit(expiryRaw) === Number(expiryCheck);
    const expiry = expiryFromYYMMDD(expiryRaw);
    if (!expiry) continue;
    if (!verified) continue; // a date that fails its check digit is not trusted

    const code = a.slice(2, 5).replace(/</g, "");
    const [surname, given] = a.slice(5).split("<<");
    const name = [given, surname]
      .filter(Boolean)
      .map((p) => p.replace(/</g, " ").trim())
      .filter(Boolean)
      .join(" ");

    return {
      kind: "passport",
      issuing_country: COUNTRIES[code] || (code || null),
      expiry_date: expiry,
      holder_name: name ? titleCase(name).slice(0, 80) : null,
      verified,
    };
  }
  return null;
}

const KINDS = new Set<string>(DOC_KINDS.map((k) => k.value));

/** Accepts only plausible values: known kind, real ISO date in a sane range, short plain-text strings. */
export function sanitizeDocumentFields(raw: Record<string, unknown>, today: string): DocumentFields {
  const str = (v: unknown, max: number) => {
    if (typeof v !== "string") return null;
    const t = v.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);
    return t || null;
  };

  let expiry: string | null = null;
  const e = typeof raw.expiry_date === "string" ? raw.expiry_date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    const d = new Date(`${e}T00:00:00Z`);
    const year = Number(e.slice(0, 4));
    const todayYear = Number(today.slice(0, 4));
    const real = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === e;
    if (real && year >= 2000 && year <= todayYear + 30) expiry = e;
  }

  const kind = typeof raw.kind === "string" && KINDS.has(raw.kind) ? (raw.kind as DocKind) : null;
  return { kind, issuing_country: str(raw.issuing_country, 80), expiry_date: expiry, holder_name: str(raw.holder_name, 80) };
}
