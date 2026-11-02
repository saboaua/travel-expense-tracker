/**
 * Receipt OCR with tesseract.js (browser or server) plus smarter text parsing.
 * The AI path lives in ocr-ai.ts; this file is the offline fallback.
 */

export interface OcrHints {
  /** Currency the user is most likely spending in (trip currency). Used to resolve 03/04/2026 style dates. */
  currency?: string | null;
  /** Category names the app offers; used to validate suggested categories. */
  categories?: string[];
}

export interface OcrResult {
  merchant: string | null;
  amount: number | null;
  currency: string | null; // ISO code, only when clearly printed on the receipt
  date: string | null; // YYYY-MM-DD
  category: string | null;
  rawText: string;
  source: "ai" | "tesseract";
}

export type OcrImageSource = File | string | Uint8Array | ArrayBuffer;

/* ------------------------------------------------------------------ */
/* Amount                                                              */
/* ------------------------------------------------------------------ */

/** Fix classic OCR digit mix-ups inside price-looking tokens: 4S.2O -> 45.20 */
function fixDigits(line: string): string {
  return line.replace(/\b[\dOolIS]{1,9}[.,][\dOolIS]{2}\b/g, (t) =>
    /\d/.test(t) ? t.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/S/g, "5") : t
  );
}

export function normalizeNumber(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalAt = Math.max(lastDot, lastComma);
  if (decimalAt === -1) return parseFloat(s);
  const intPart = s.slice(0, decimalAt).replace(/[.,]/g, "");
  const frac = s.slice(decimalAt + 1);
  s = `${intPart}.${frac}`;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const MONEY_RE = /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  const matches = fixDigits(line).match(MONEY_RE) || [];
  for (const m of matches) {
    const n = normalizeNumber(m);
    if (n != null && n > 0 && n < 10_000_000) out.push(n);
  }
  return out;
}

const STRONG_TOTAL =
  /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total\s*amount|total\s*to\s*pay|total\s*paid|amount\s*paid|importe\s*total|monto\s*total|total\s*a\s*pagar|totaal|summe|gesamt)\b/;
const PLAIN_TOTAL = /\btotal\b/;
const PENALTY =
  /\b(sub\s*-?\s*total|subtotal|tax|vat|btw|igv|itbis|gst|service\s*charge|tip|gratuity|change|cash|tender(ed)?|discount|savings|points|items?|qty|quantity|auth(orization)?|approval|ref(erence)?)\b/;

function lineScore(line: string): number {
  const l = line.toLowerCase();
  let score = 0;
  if (STRONG_TOTAL.test(l)) score += 10;
  else if (PLAIN_TOTAL.test(l)) score += 6;
  else if (/\b(card|visa|mastercard|amex|debit|credit)\b/.test(l) && /\b(charged|payment|paid|amount|sale)\b/.test(l)) score += 3;
  const incl = /\bincl|\binc\.|including/.test(l);
  if (PENALTY.test(l) && !(incl && /\btax|vat\b/.test(l))) score -= 8;
  return score;
}

export function parseAmount(text: string): number | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let best: { score: number; idx: number; value: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const score = lineScore(lines[i]);
    if (score <= 0) continue;
    let nums = amountsIn(lines[i]);
    // Label alone on a line ("TOTAL") with the figure on the next line
    if (nums.length === 0 && i + 1 < lines.length && lineScore(lines[i + 1]) >= 0) nums = amountsIn(lines[i + 1]);
    if (nums.length === 0) continue;
    const value = nums[nums.length - 1]; // figures are right-aligned: the last one is the line total
    if (!best || score > best.score || (score === best.score && i >= best.idx)) best = { score, idx: i, value };
  }
  if (best) return best.value;

  // No labelled total: biggest figure among the lower part of the receipt, ignoring penalised lines
  const tail = lines.slice(Math.floor(lines.length * 0.5));
  const pool = tail.filter((l) => lineScore(l) >= 0).flatMap(amountsIn);
  if (pool.length) return Math.max(...pool);
  const all = lines.flatMap(amountsIn);
  return all.length ? Math.max(...all) : null;
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

const CODES = [
  "USD", "EUR", "GBP", "AWG", "XCD", "GYD", "SRD", "CAD", "MXN", "BRL", "CHF", "JPY", "CNY", "INR", "AUD",
  "NZD", "SGD", "HKD", "SEK", "NOK", "DKK", "ZAR", "AED", "COP", "PAB", "DOP", "TTD", "JMD", "BBD", "ANG",
];

const SYMBOLS: [RegExp, string][] = [
  [/US\s?\$/i, "USD"],
  [/€/, "EUR"],
  [/£/, "GBP"],
  [/R\$/, "BRL"],
  [/\bA?fl\.?\s?\d|\bAfl\b/i, "AWG"],
  [/\bEC\s?\$/i, "XCD"],
  [/\b(CA|C)\$/, "CAD"],
  [/\bMX\s?\$/i, "MXN"],
  [/\b(AU|A)\$/, "AUD"],
  [/\bNZ\$/, "NZD"],
  [/\bS\$/, "SGD"],
  [/\bHK\$/, "HKD"],
  [/₹/, "INR"],
];

export function parseCurrency(text: string): string | null {
  const counts = new Map<string, number>();
  for (const code of CODES) {
    const found = text.match(new RegExp(`\\b${code}\\b`, "g"));
    if (found) counts.set(code, found.length);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const [re, code] of SYMBOLS) if (re.test(text)) return code;
  return null; // a bare "$" is ambiguous (USD, AWG, XCD...), so leave the trip currency alone
}

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, dic: 12, mrt: 3, mei: 5, okt: 10,
};

const MONTH_FIRST_CURRENCIES = new Set(["USD", "CAD", "PHP"]);

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function plausible(date: string, now = new Date()): boolean {
  const t = Date.parse(date);
  const max = now.getTime() + 36 * 3600 * 1000;
  const min = now.getTime() - 5 * 365 * 24 * 3600 * 1000;
  return t <= max && t >= min;
}

function dateCandidates(line: string, monthFirst: boolean): string[] {
  const out: string[] = [];
  const push = (v: string | null) => v && out.push(v);

  for (const m of line.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(iso(+m[1], +m[2], +m[3]));

  for (const m of line.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/g)) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) push(iso(y, b, a));
    else if (b > 12) push(iso(y, a, b));
    else push(monthFirst ? iso(y, a, b) : iso(y, b, a));
  }

  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic|mrt|mei|okt)[a-z]*";
  for (const m of line.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-.]*${mon}\\.?[\\s\\-.,]*(\\d{4}|\\d{2})\\b`, "gi")))
    push(iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  for (const m of line.matchAll(new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}|\\d{2})\\b`, "gi")))
    push(iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));

  return out;
}

export function parseDate(text: string, hints: OcrHints = {}, now = new Date()): string | null {
  const monthFirst = !hints.currency || MONTH_FIRST_CURRENCIES.has(hints.currency);
  const lines = text.split(/\r?\n/);
  // Lines that say "date" first, then everything else
  const ordered = [...lines.filter((l) => /\bdate|fecha|datum\b/i.test(l)), ...lines];
  for (const line of ordered) {
    for (const c of dateCandidates(line, monthFirst)) if (plausible(c, now)) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Merchant and category                                               */
/* ------------------------------------------------------------------ */

const NOT_MERCHANT =
  /^(tel|phone|fax|www\.|http|invoice|receipt|tax\s*id|vat|order|table|cashier|server|date|time|welcome|thank|customer|copy|duplicate)|@|\b(street|st\.|avenue|ave\.?|road|rd\.?|blvd|calle|straat|weg)\b/i;

export function parseMerchant(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\p{L}\p{N}&'.,\- ]/gu, " ").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;
    if (NOT_MERCHANT.test(line)) continue;
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3 || letters / line.length < 0.6) continue; // mostly digits/symbols
    return line.slice(0, 80);
  }
  return null;
}

const CATEGORY_RULES: [string, RegExp][] = [
  ["Lodging", /\b(hotel|resort|inn|suites?|hostel|airbnb|lodging|room\s*(charge|rate)|folio|guest|nights?|check[- ]?(in|out))\b/i],
  ["Fuel", /\b(fuel|petrol|diesel|unleaded|gasoline|gas\s*station|gallons?|litres?|liters?|shell|esso|chevron|texaco|total\s*energies|pump)\b/i],
  ["Transport", /\b(uber|lyft|taxi|cab|airline|airways?|flight|boarding|ticket\s*no|rental|hertz|avis|budget\s*rent|parking|toll|metro|train|railway|bus|ferry|copa|klm|jetblue|delta|united)\b/i],
  ["Meals", /\b(restaurant|cafe|caf[eé]|coffee|pizza|grill|bistro|burger|kitchen|bakery|diner|bar\b|pub|sushi|tacos?|steak|lunch|dinner|breakfast|gratuity|tip|server|table|starbucks|mcdonald|subway|kfc|wendy)\b/i],
  ["Entertainment", /\b(cinema|theat(er|re)|museum|tour|casino|concert|tickets?|show|admission|park\s*entry)\b/i],
  ["Office Supplies", /\b(staples|office\s*depot|stationery|printer|toner|ink|paper|supplies|notebook)\b/i],
];

export function guessCategory(text: string, allowed?: string[]): string | null {
  let best: { name: string; hits: number } | null = null;
  for (const [name, re] of CATEGORY_RULES) {
    const hits = (text.match(new RegExp(re.source, "gi")) || []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { name, hits };
  }
  if (!best) return null;
  if (!allowed || allowed.length === 0) return best.name;
  return allowed.find((a) => a.toLowerCase() === best!.name.toLowerCase()) ?? null;
}

/** Parse plain OCR text into fields. Exported so it can be tested without an image. */
export function parseReceiptText(text: string, hints: OcrHints = {}): Omit<OcrResult, "source"> {
  return {
    merchant: parseMerchant(text),
    amount: parseAmount(text),
    currency: parseCurrency(text),
    date: parseDate(text, hints),
    category: guessCategory(text, hints.categories),
    rawText: text,
  };
}

/* ------------------------------------------------------------------ */
/* Image preparation + Tesseract                                       */
/* ------------------------------------------------------------------ */

/** Grayscale + contrast stretch (+ upscale small photos) in the browser: noticeably better OCR on dim photos. */
async function preprocessForOcr(src: OcrImageSource): Promise<HTMLCanvasElement | null> {
  if (typeof document === "undefined" || !(src instanceof Blob)) return null;
  try {
    const bitmap = await createImageBitmap(src, { imageOrientation: "from-image" });
    const longer = Math.max(bitmap.width, bitmap.height);
    const scale = longer < 1400 ? 1800 / longer : longer > 2600 ? 2600 / longer : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
      hist[g]++;
    }
    const total = w * h;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
    const range = Math.max(hi - lo, 1);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.min(255, Math.max(0, Math.round(((d[i] - lo) * 255) / range)));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}

type TessWorker = import("tesseract.js").Worker;
let workerPromise: Promise<TessWorker> | null = null;

/** One reusable worker: the language data is downloaded once instead of on every receipt. */
async function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: () => {} });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN, // receipts are one narrow column of text
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function runReceiptOcr(imageSource: OcrImageSource, hints: OcrHints = {}): Promise<OcrResult> {
  const prepared = await preprocessForOcr(imageSource);
  const worker = await getWorker();

  let text: string;
  try {
    const result = await worker.recognize((prepared ?? imageSource) as never);
    text = result.data.text || "";
  } catch (e) {
    workerPromise = null; // recreate on next call
    throw e;
  }

  return { ...parseReceiptText(text, hints), source: "tesseract" };
}
