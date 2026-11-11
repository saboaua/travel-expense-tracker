import { runReceiptOcr, type OcrHints, type OcrResult } from "@/lib/ocr";
import { parseLineItems } from "@/lib/personal/grocery";
import type { GroceryScan } from "@/lib/ocr-ai";
import { compressReceiptImage } from "@/lib/compress-image";

const AI_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// The host refuses request bodies above about 4.5 MB; a bigger photo would never reach the AI reader
const AI_MAX_BYTES = 3.2 * 1024 * 1024;
const AI_WAIT_MS = 58_000;

/** A photo the AI reader can take: a JPEG/PNG/WebP/GIF small enough to upload (a HEIC or huge photo is re-encoded). */
async function forAi(file: File): Promise<File> {
  if (AI_TYPES.includes(file.type) && file.size <= AI_MAX_BYTES) return file;
  try {
    return await compressReceiptImage(file, { maxSide: 2400, quality: 0.82 });
  } catch {
    return file; // the server explains why it cannot use it
  }
}

let aiUnavailable = false; // set once the server says AI OCR is not configured

type AiAttempt = { result?: unknown; reason?: string };

/** Asks the server's AI reader. When it cannot help, says why, so the screen can explain that basic OCR was used. */
async function askAi(form: FormData, usable: (r: never) => boolean): Promise<AiAttempt> {
  if (aiUnavailable) return { reason: "not_configured" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { reason: "offline" };
  try {
    const res = await fetch("/api/ocr", { method: "POST", body: form, signal: AbortSignal.timeout(AI_WAIT_MS) });
    if (res.status === 503) { aiUnavailable = true; return { reason: "not_configured" }; }
    if (res.ok) {
      const { result } = (await res.json()) as { result?: unknown };
      return result && usable(result as never) ? { result } : { reason: "ai_empty" };
    }
    const body = (await res.json().catch(() => ({}))) as { reason?: string; upstream?: string | null };
    return { reason: body.reason === "ai_failed" ? `ai_failed${body.upstream ? `_${body.upstream}` : ""}` : body.reason || `http_${res.status}` };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return { reason: "timeout" };
    return { reason: "network" }; // network problem: on-device OCR takes over
  }
}

/** A short, plain reason why the AI reader was not used. */
export function aiFallbackText(reason?: string): string {
  if (!reason) return "";
  if (reason === "not_configured") return "GEMINI_API_KEY is not set on the server";
  if (reason === "limit") return "too many scans this hour";
  if (reason === "offline" || reason === "network") return "no connection to the AI reader";
  if (reason === "timeout" || reason === "http_504") return "the AI reader took too long";
  if (reason === "http_413") return "the photo was too large to send";
  if (reason === "http_415") return "the AI reader cannot open this photo type";
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
  form.append("file", await forAi(file));
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
  form.append("file", await forAi(file));
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
