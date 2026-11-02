import { runReceiptOcr, type OcrHints, type OcrResult } from "@/lib/ocr";

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
