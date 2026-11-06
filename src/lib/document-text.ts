/**
 * Reads the printed text of a document (from on-device OCR) when the AI reader is not available.
 * Works for what has no machine-readable lines: driver's licenses, ID cards, visas, insurance cards.
 * It only returns what it can find next to a recognisable label, so a wrong guess is rare, and the form always asks the
 * person to check. It never returns a date of birth or any personal number.
 */
import { COUNTRY_NAMES, sanitizeDocumentFields, type DocumentFields } from "@/lib/mrz";
import type { DocKind } from "@/lib/documents";

/** First three letters of the month in English, Spanish, Dutch, Portuguese, French and German. */
const MONTHS: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, fev: 2, "féb": 2, mar: 3, mrt: 3, maa: 3, "mär": 3, apr: 4, abr: 4, avr: 4, may: 5, mei: 5, mai: 5,
  jun: 6, jul: 7, aug: 8, ago: 8, aou: 8, "aoû": 8, sep: 9, set: 9, oct: 10, okt: 10, out: 10, nov: 11, dec: 12, dic: 12, dez: 12, "déc": 12,
};

type Found = { iso: string; index: number };

const pad = (n: number) => String(n).padStart(2, "0");
function realDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Every date in the text, with where it was found. Handles "13 MRT /MRT 2028", "13/03/2028", "13.03.2028" and "2028-03-13". */
export function findDates(text: string, monthFirst = false): Found[] {
  const out: Found[] = [];
  const add = (iso: string | null, index: number) => { if (iso) out.push({ iso, index }); };
  for (const m of text.matchAll(/\b(\d{1,2})\s*([A-Za-zÀ-ÿ]{3,9})\.?\s*(?:[/|\-]\s*[A-Za-zÀ-ÿ]{3,9}\.?\s*)?(\d{4})\b/g)) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) add(realDate(+m[3], mon, +m[1]), m.index ?? 0);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g)) {
    const a = +m[1], b = +m[2];
    // Day first (Aruba, Europe, Latin America); month first for US documents, or when the first number cannot be a month
    add(monthFirst ? (a > 12 ? realDate(+m[3], b, a) : realDate(+m[3], a, b)) : b > 12 && a <= 12 ? realDate(+m[3], a, b) : realDate(+m[3], b, a), m.index ?? 0);
  }
  for (const m of text.matchAll(/\b(\d{4})[/.\-](\d{2})[/.\-](\d{2})\b/g)) add(realDate(+m[1], +m[2], +m[3]), m.index ?? 0);
  return out.sort((x, y) => x.index - y.index);
}

const EXPIRY_LABEL = /(date\s*of\s*expir\w*|expir\w*|valid\s*(?:until|thru|through|to)|valido\s*te|geldig\s*tot|vervaldatum|vencimiento|caducidad|fecha\s*de\s*venc\w*|vence|valable|\b4b\b)/gi;
const OTHER_LABEL = /(date\s*of\s*issue|issue\w*|birth|nacimiento|geboorte|naissance|entrega|afgifte|emisi\w*|\b4a\b|date\s*of\s*birth)/gi;

function lastLabelBefore(text: string, index: number, re: RegExp): number {
  const slice = text.slice(Math.max(0, index - 90), index);
  let last = -1;
  for (const m of slice.matchAll(re)) last = (m.index ?? 0) + m[0].length;
  return last;
}

/** The expiry date: a date whose nearest label before it says "expiry"; otherwise a future date on an ID-type document. */
export function findExpiry(text: string, today: string, idLike: boolean, monthFirst = false): string | null {
  const dates = findDates(text, monthFirst);
  const labelled = dates.filter((d) => {
    const exp = lastLabelBefore(text, d.index, EXPIRY_LABEL);
    return exp >= 0 && exp >= lastLabelBefore(text, d.index, OTHER_LABEL);
  });
  if (labelled.length) return labelled.map((d) => d.iso).sort().at(-1) ?? null;
  if (idLike) {
    const future = dates.map((d) => d.iso).filter((iso) => iso >= today).sort();
    if (future.length) return future.at(-1) ?? null;
  }
  return null;
}

const NUMBER_LABEL = /(document\s*(?:number|no\.?|nr\.?)|doc\.?\s*(?:number|no\.?)|licen[cs]e\s*(?:number|no\.?)|n[uú]mero\s*de\s*(?:documento|licencia)|dl\s*(?:number|no\.?)|id\s*(?:number|no\.?)|card\s*(?:number|no\.?)|policy\s*(?:number|no\.?)|application\s*(?:id|number)|passport\s*(?:number|no\.?))/i;

/** The value that belongs to a "Document number"-style label: on the same line after it, or on the next line. */
export function findNumber(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const pick = (chunk: string): string | null => {
    const tokens = chunk.split(/[\s|:]+/).map((t) => t.replace(/[^A-Za-z0-9-]/g, "").toUpperCase()).filter((t) => t.replace(/-/g, "").length >= 5 && /\d/.test(t));
    const clean = tokens.filter((t) => !/^\d{4}$/.test(t) && !findDates(t).length);
    const mixed = clean.find((t) => /[A-Z]/.test(t) && /\d/.test(t));
    return (mixed ?? clean[0])?.replace(/-/g, "") ?? null;
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(NUMBER_LABEL);
    if (!m) continue;
    const after = lines[i].slice((m.index ?? 0) + m[0].length);
    const here = pick(after);
    if (here) return here;
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const next = pick(lines[j]);
      if (next) return next;
    }
  }
  return null;
}

const KIND_WORDS: [DocKind, RegExp][] = [
  ["license", /(driv(?:er|ing)\s*licen[cs]e|rijbewijs|licencia\s*de\s*conducir|permis\s*de\s*conduire|f[uü]hrerschein|carta\s*de\s*condu)/i],
  ["passport", /(passport|pasaporte|paspoort|passeport|reisepass)/i],
  ["id", /(identity\s*card|identification\s*card|id\s*card|identiteitsbewijs|c[eé]dula|tarjeta\s*de\s*identidad|carte\s*d.identit)/i],
  ["visa", /(\bvisa\b|\besta\b|travel\s*authori[sz]ation|e-?visa)/i],
  ["insurance", /(insurance|verzekering|seguro|assurance|policy)/i],
  ["vaccination", /(vaccin\w*|immuni[sz]ation|vacuna)/i],
];

export function guessKind(text: string): DocKind | null {
  return KIND_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

function findCountry(text: string): string | null {
  const hits = COUNTRY_NAMES.map((name) => ({ name, i: text.search(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
  return hits[0]?.name ?? null;
}

/** US documents print slash dates month first. */
const US_STYLE = /(united\s*states|\busa\b|u\.s\.|homeland\s*security|\besta\b)/i;

/** Fields found in the printed text, or all-null when nothing recognisable was there. */
export function parseDocumentText(text: string, today: string): DocumentFields {
  const kind = guessKind(text);
  const idLike = kind === "license" || kind === "id" || kind === "passport" || kind === "visa";
  return sanitizeDocumentFields(
    { kind, document_number: findNumber(text), issuing_country: findCountry(text), expiry_date: findExpiry(text, today, idLike, US_STYLE.test(text)), holder_name: null },
    today
  );
}
