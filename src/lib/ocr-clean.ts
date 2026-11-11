/**
 * Tidies raw OCR text before it is parsed into amounts and line items. Classic OCR makes the same
 * mistakes again and again on thermal receipts: a letter read as a digit (2.4S, l.89, 3.OO), a space
 * inside a price (2 .49), dot leaders between name and price, a currency sign glued to the figure,
 * and a minus printed after the number (1.00-). Fixing those first makes every parser below simpler.
 */

const PRICE_TOKEN = /(?<![\p{L}\d])[\dOolIS]{1,9}[.,][\dOolIS]{2}(?![\p{L}\d])/gu;

/** 4S.2O -> 45.20, l.89 -> 1.89. Only tokens that already look like a price and hold a real digit are touched. */
export function fixDigits(line: string): string {
  return line.replace(PRICE_TOKEN, (t) => (/\d/.test(t) ? t.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/S/g, "5") : t));
}

const CURRENCY_BEFORE_FIGURE = /(?:(?<![\p{L}\d])(?:US|CA|AU|EC)?\$|\b(?:AWG|USD|EUR|ANG|XCD|CAD|GBP|Afl)\.?|[€£]|\bF(?=\s+\d+[.,]\d{2}))\s*(?=-?\d)/giu;

export function cleanOcrText(text: string): string {
  return text
    .replace(/[   \t]/g, " ")
    .split(/\r?\n/)
    .map((raw) => {
      let l = raw;
      // dot, dash, underscore and middle-dot leaders between a name and its price
      l = l.replace(/(?:\s*[.·•_\-–—]{3,}\s*)/g, "  ").replace(/\s\.{2}\s/g, "  ");
      // a space inside the price: "2 .49" and "3. 10"
      l = l.replace(/(\d)\s+([.,]\d{2})(?!\d)/g, "$1$2").replace(/(\d[.,])\s+(\d{2})(?!\d)/g, "$1$2");
      l = fixDigits(l);
      // "$2.49" and "AWG 2.49" -> "2.49"
      l = l.replace(CURRENCY_BEFORE_FIGURE, "");
      // minus after the figure: "1.00-" -> "-1.00"
      l = l.replace(/(?<![\d.,])(\d{1,4}(?:[.,]\d{3})*[.,]\d{2})\s*(?:-|CR\b)(?=\s*[A-Z]?\s*$)/, "-$1");
      // stray marks the scanner leaves at the end of a line ("5.83  =", "8.30 |")
      l = l.replace(/\s+[=|~_:;]+\s*$/, "");
      return l.replace(/[ ]{3,}/g, "  ").trim();
    })
    .join("\n");
}

const MONEY_TOKEN = /(?<![\d.,])-?(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?![\d])/g;

/** Every price-looking figure in a text, after the usual OCR repairs. A comma or dot is the decimal mark when two digits follow it. */
export function moneyTokens(text: string): number[] {
  const out: number[] = [];
  for (const m of cleanOcrText(text).matchAll(MONEY_TOKEN)) {
    const s = m[1];
    const at = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    const n = parseFloat(`${s.slice(0, at).replace(/[.,]/g, "")}.${s.slice(at + 1)}`);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) out.push(Math.round(n * 100) / 100);
  }
  return out;
}
