import { runReceiptOcr, type OcrHints, type OcrResult } from "@/lib/ocr";
import { parseLineItems } from "@/lib/personal/grocery";
import type { GroceryScan } from "@/lib/ocr-ai";

let aiUnavailable = false; // set once the server says AI OCR is not configured

/**
 * Browser entry point: try AI reading first (accurate), fall back to on-device OCR
 * (works offline-ish and needs no API key).
 */
export async function extractReceipt(file: File, hints: OcrHints = {}): Promise<OcrResult> {
  if (!aiUnavailable) {
    try {
      const form = new FormData();
      form.append("file", file);
      if (hints.currency) form.append("currency", hints.currency);
      form.append("categories", JSON.stringify(hints.categories || []));

      const res = await fetch("/api/ocr", { method: "POST", body: form });
      if (res.status === 503) aiUnavailable = true;
      else if (res.ok) {
        const { result } = (await res.json()) as { result?: OcrResult };
        if (result && (result.amount != null || result.merchant || result.date)) return result;
      }
    } catch {
      // network problem: use on-device OCR
    }
  }
  return runReceiptOcr(file, hints);
}

/**
 * Grocery receipts: AI returns every line item. Without AI the on-device OCR text is parsed into
 * items with a line-item parser, which is less exact, so the review screen always lets the user fix rows.
 */
export async function extractGroceryReceipt(file: File, hints: OcrHints = {}): Promise<GroceryScan> {
  if (!aiUnavailable) {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "grocery");
      if (hints.currency) form.append("currency", hints.currency);

      const res = await fetch("/api/ocr", { method: "POST", body: form });
      if (res.status === 503) aiUnavailable = true;
      else if (res.ok) {
        const { result } = (await res.json()) as { result?: GroceryScan };
        if (result && (result.items.length > 0 || result.total != null)) return result;
      }
    } catch {
      // network problem: use on-device OCR
    }
  }

  const ocr = await runReceiptOcr(file, hints);
  return {
    store: ocr.merchant,
    date: ocr.date,
    total: ocr.amount,
    currency: ocr.currency,
    items: parseLineItems(ocr.rawText),
    source: "tesseract",
  };
}
