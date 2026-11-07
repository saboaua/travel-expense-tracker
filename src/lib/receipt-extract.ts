import { runReceiptOcr, type OcrHints, type OcrResult } from "@/lib/ocr";
import { parseLineItems } from "@/lib/personal/grocery";
import type { GroceryScan } from "@/lib/ocr-ai";

let aiUnavailable = false; // set once the server says AI OCR is not configured

type AiAttempt = { result?: unknown; reason?: string };

/** Asks the server's AI reader. When it cannot help, says why, so the screen can explain that basic OCR was used. */
async function askAi(form: FormData, usable: (r: never) => boolean): Promise<AiAttempt> {
  if (aiUnavailable) return { reason: "not_configured" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { reason: "offline" };
  try {
    const res = await fetch("/api/ocr", { method: "POST", body: form });
    if (res.status === 503) { aiUnavailable = true; return { reason: "not_configured" }; }
    if (res.ok) {
      const { result } = (await res.json()) as { result?: unknown };
      return result && usable(result as never) ? { result } : { reason: "ai_empty" };
    }
    const body = (await res.json().catch(() => ({}))) as { reason?: string; upstream?: string | null };
    return { reason: body.reason === "ai_failed" ? `ai_failed${body.upstream ? `_${body.upstream}` : ""}` : body.reason || `http_${res.status}` };
  } catch {
    return { reason: "network" }; // network problem: on-device OCR takes over
  }
}

/** A short, plain reason why the AI reader was not used. */
export function aiFallbackText(reason?: string): string {
  if (!reason) return "";
  if (reason === "not_configured") return "GEMINI_API_KEY is not set on the server";
  if (reason === "limit") return "too many scans this hour";
  if (reason === "offline" || reason === "network") return "no connection to the AI reader";
  if (reason === "ai_empty") return "the AI found nothing readable in the photo";
  if (reason.startsWith("ai_failed")) {
    const code = reason.split("_")[2];
    if (code === "404") return "the AI model was not found (404), check OCR_MODEL in Vercel";
    if (code === "401" || code === "403") return `the AI key was refused (${code}), check GEMINI_API_KEY`;
    if (code === "429") return "the AI key hit its rate or credit limit (429)";
    return `the AI service returned an error${code ? ` (${code})` : ""}`;
  }
  return `the AI reader could not be used (${reason})`;
}

/** "AI" or "basic OCR (the AI reader was unavailable: why)". */
export function howRead(r: { source: string; aiReason?: string }): string {
  if (r.source === "ai") return "AI";
  return r.aiReason ? `basic OCR; AI unavailable: ${aiFallbackText(r.aiReason)}` : "basic OCR";
}

/**
 * Browser entry point: try AI reading first (accurate), fall back to on-device OCR
 * (works offline-ish and needs no API key).
 */
export async function extractReceipt(file: File, hints: OcrHints = {}): Promise<OcrResult> {
  const form = new FormData();
  form.append("file", file);
  if (hints.currency) form.append("currency", hints.currency);
  form.append("categories", JSON.stringify(hints.categories || []));
  const ai = await askAi(form, (r: OcrResult) => r.amount != null || !!r.merchant || !!r.date);
  if (ai.result) return ai.result as OcrResult;
  return { ...(await runReceiptOcr(file, hints)), aiReason: ai.reason };
}

/**
 * Grocery receipts: AI returns every line item. Without AI the on-device OCR text is parsed into
 * items with a line-item parser, which is less exact, so the review screen always lets the user fix rows.
 */
export async function extractGroceryReceipt(file: File, hints: OcrHints = {}): Promise<GroceryScan> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", "grocery");
  if (hints.currency) form.append("currency", hints.currency);
  if (hints.categories?.length) form.append("categories", JSON.stringify(hints.categories));
  const ai = await askAi(form, (r: GroceryScan) => r.items.length > 0 || r.total != null);
  if (ai.result) return ai.result as GroceryScan;

  const ocr = await runReceiptOcr(file, hints);
  return {
    store: ocr.merchant,
    date: ocr.date,
    total: ocr.amount,
    currency: ocr.currency,
    items: parseLineItems(ocr.rawText),
    source: "tesseract",
    aiReason: ai.reason,
  };
}
