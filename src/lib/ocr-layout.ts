/**
 * Reads a receipt by position instead of by text line. Tesseract reports every word with its box; rows are
 * rebuilt from the boxes (words at the same height belong together), the name sits on the left and the
 * price on the right. That repairs what plain text loses: a name that wraps onto a second row, a price
 * pushed onto its own line, and it gives every price its own confidence.
 */
import { cleanOcrText, fixDigits } from "@/lib/ocr-clean";
import { parseLineItems, type GroceryLine } from "@/lib/personal/grocery";
import { checkGrocery } from "@/lib/receipt-check";

export type OcrWord = { text: string; conf: number; x0: number; y0: number; x1: number; y1: number };

export type LayoutRow = {
  text: string;
  /** The right-most figure on the row when it looks like a price, as printed. */
  price: string | null;
  /** Tesseract's confidence (0 to 100) for that figure, or for the whole row when it has none. */
  priceConf: number | null;
  /** Average confidence of the row's words. */
  conf: number;
};

/** Keeps only what is needed from tesseract.js words (its raw output also holds every single character). */
export function slimWords(raw: unknown): OcrWord[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrWord[] = [];
  for (const w of raw as { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }[]) {
    const text = (w.text || "").trim();
    if (!text || !w.bbox) continue;
    out.push({ text, conf: w.confidence ?? 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const PRICE_WORD = /^-?\d{1,4}(?:[.,]\d{3})*[.,]\d{2}[A-Z]?$/;

export function buildRows(words: OcrWord[]): LayoutRow[] {
  if (words.length === 0) return [];
  const heights = words.map((w) => w.y1 - w.y0).filter((h) => h > 0);
  const mh = median(heights) || 10;
  const charW = median(words.filter((w) => w.text.length > 1).map((w) => (w.x1 - w.x0) / w.text.length)) || mh * 0.55;

  // Group words whose vertical centres are close
  const sorted = [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const groups: OcrWord[][] = [];
  let centre = -Infinity;
  for (const w of sorted) {
    const c = (w.y0 + w.y1) / 2;
    const last = groups[groups.length - 1];
    if (last && Math.abs(c - centre) <= mh * 0.6) {
      last.push(w);
      centre = (centre * (last.length - 1) + c) / last.length;
    } else {
      groups.push([w]);
      centre = c;
    }
  }

  return groups.map((g) => {
    const row = [...g].sort((a, b) => a.x0 - b.x0);
    let text = "";
    for (let i = 0; i < row.length; i++) {
      if (i > 0) text += row[i].x0 - row[i - 1].x1 > charW * 2.2 ? "  " : " "; // a wide gap separates name from price
      text += row[i].text;
    }
    const last = row[row.length - 1];
    const lastFixed = fixDigits(last.text);
    const isPrice = PRICE_WORD.test(lastFixed.replace(/^[A-Za-z€£$]+(?=\d)/, ""));
    const weight = (w: OcrWord) => Math.max(1, w.text.length);
    const conf = row.reduce((s, w) => s + w.conf * weight(w), 0) / row.reduce((s, w) => s + weight(w), 0);
    return { text, price: isPrice ? lastFixed : null, priceConf: isPrice ? last.conf : null, conf: Math.round(conf) };
  });
}

const NO_NAME_LINE = /^\d+(?:[.,]\d+)?\s*(?:kg|kgs|lb|lbs|g|oz|[xX@×])/;

/** The rows as text for the line-item parser. A row that is only a name, followed by a row that is only a price or size and price, becomes one line. */
export function layoutText(rows: LayoutRow[]): string {
  const money = /-?\d[\d.,]*[.,]\d{2}\s*[A-Z]?$/;
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i].text;
    const next = rows[i + 1]?.text;
    if (next && !money.test(cleanOcrText(cur)) && (cur.match(/\p{L}/gu) || []).length >= 3) {
      const nc = cleanOcrText(next);
      const namePart = nc.replace(money, "").replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|oz|fl|lb|lbs|ct|pk|pc|pcs|ea|gal|qt|pt|x)\b/gi, "").trim();
      if (money.test(nc) && (namePart.match(/\p{L}/gu) || []).length <= 2 && !NO_NAME_LINE.test(nc)) {
        out.push(`${cur} ${next}`);
        i++;
        continue;
      }
    }
    out.push(cur);
  }
  return out.join("\n");
}

/**
 * Items from a reading: tries the layout text and Tesseract's own text and keeps the one whose items agree best
 * with the receipt's total (and are more numerous when equally good). Each item carries how sure the reader was of its price.
 */
export function bestItems(rawText: string, rows: LayoutRow[] | undefined, total: number | null): GroceryLine[] {
  const candidates = [parseLineItems(rawText)];
  if (rows && rows.length > 0) candidates.push(parseLineItems(layoutText(rows)));
  const scored = candidates.map((items) => ({ items, score: checkGrocery({ items, total }).score }));
  scored.sort((a, b) => a.score - b.score || b.items.length - a.items.length);
  const items = scored[0].items;
  if (rows) {
    for (const it of items) {
      const printed = it.line_total.toFixed(2);
      const row = rows.find((r) => r.price != null && r.price.replace(",", ".").replace(/[A-Z]$/, "") === printed);
      if (row?.priceConf != null) it.conf = Math.round(row.priceConf);
    }
  }
  return items;
}
