/** Receipt OCR helpers using tesseract.js (browser or server) */

export interface OcrResult {
  merchant: string | null;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  rawText: string;
}

export type OcrImageSource = File | string | Uint8Array | ArrayBuffer;

function parseAmount(text: string): number | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const totalLine = lines.find((l) =>
    /\b(total|amount due|balance due|grand total|summe|totaal)\b/i.test(l)
  );

  const candidates: number[] = [];

  const extract = (s: string) => {
    const matches = s.match(/(?:[$€£]?\s*)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g);
    if (!matches) return;
    for (const m of matches) {
      let n = m.replace(/[$€£\s]/g, "");
      if (/\d\.\d{3},\d{2}$/.test(n) || /^\d+,\d{2}$/.test(n)) {
        n = n.replace(/\./g, "").replace(",", ".");
      } else {
        n = n.replace(/,/g, "");
      }
      const val = parseFloat(n);
      if (!isNaN(val) && val > 0 && val < 1000000) candidates.push(val);
    }
  };

  if (totalLine) extract(totalLine);
  if (candidates.length === 0) {
    lines.slice(-8).forEach(extract);
  }
  if (candidates.length === 0) extract(text);

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const us = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const mon = text.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i
  );
  if (mon) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[mon[2].slice(0, 3).toLowerCase()];
    if (m) return `${mon[3]}-${m}-${mon[1].padStart(2, "0")}`;
  }
  return null;
}

function parseMerchant(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && l.length < 60);

  for (const line of lines.slice(0, 8)) {
    if (/^\d+[.,]\d{2}$/.test(line)) continue;
    if (/^tel|phone|www\.|http|invoice|receipt|tax id/i.test(line)) continue;
    if (/\d{5,}/.test(line) && line.length < 20) continue;
    if (/[A-Za-z]{3,}/.test(line)) {
      return line.replace(/\s{2,}/g, " ").slice(0, 80);
    }
  }
  return null;
}

export async function runReceiptOcr(
  imageSource: OcrImageSource
): Promise<OcrResult> {
  const Tesseract = (await import("tesseract.js")).default;

  const result = await Tesseract.recognize(imageSource as File, "eng", {
    logger: () => {},
  });

  const rawText = result.data.text || "";

  return {
    merchant: parseMerchant(rawText),
    amount: parseAmount(rawText),
    date: parseDate(rawText),
    rawText,
  };
}
