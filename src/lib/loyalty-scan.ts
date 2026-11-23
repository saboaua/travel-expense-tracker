/** Reads a loyalty card photo: the barcode itself first, then the AI reader, then the phone's own text reader. The photo is not kept. */
import { compressReceiptImage } from "@/lib/compress-image";
import { aiFallbackText } from "@/lib/receipt-extract";
import { isEmptyRead, parseCardText, sanitizeCardRead, type CardRead } from "@/lib/loyalty-read";
import type { BarcodeFormat } from "@/lib/loyalty";

export type CardScanOutcome = { ok: true; read: CardRead; basic?: boolean } | { ok: false; reason: "offline" | "quota" | "limit" | "unavailable" | "unreadable"; why?: string };

export const CARD_SCAN_MESSAGE: Record<Extract<CardScanOutcome, { ok: false }>["reason"], string> = {
  offline: "You are offline. Connect to read the card, or type the details in.",
  quota: "Your AI scans for this month are used up. Type the details in instead.",
  limit: "Too many scans this hour. Type the details in, or try again later.",
  unavailable: "Reading is not available right now. Type the details in instead.",
  unreadable: "Could not read this card. Retake the photo with the card flat and the barcode sharp, or type the details in.",
};

const DETECTOR_FORMATS: Record<string, BarcodeFormat> = { code_128: "CODE128", qr_code: "QR", ean_13: "EAN13", upc_a: "UPCA" };

/** The phone's built-in barcode reader, where it exists. Gives the exact number and format. */
async function readBarcode(file: File): Promise<CardRead | null> {
  try {
    const Detector = (globalThis as unknown as { BarcodeDetector?: new (o?: unknown) => { detect(i: ImageBitmap): Promise<{ rawValue: string; format: string }[]> } }).BarcodeDetector;
    if (!Detector || typeof createImageBitmap !== "function") return null;
    const bmp = await createImageBitmap(file);
    const found = await new Detector().detect(bmp);
    bmp.close?.();
    const hit = found.find((b) => b.rawValue && DETECTOR_FORMATS[b.format]);
    if (!hit) return null;
    return { store: null, category: null, holder: null, number: hit.rawValue, format: DETECTOR_FORMATS[hit.format], fromBarcode: true };
  } catch { return null; }
}

async function askAi(file: File): Promise<CardScanOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
  let img = file;
  try { img = await compressReceiptImage(file, { maxSide: 2000, quality: 0.85 }); } catch { /* the server explains if it cannot use it */ }
  const form = new FormData();
  form.append("file", img);
  form.append("mode", "loyalty-card");
  try {
    const res = await fetch("/api/ocr", { method: "POST", body: form, signal: AbortSignal.timeout(25000) });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("lifolio:ai-scan"));
    if (res.ok) {
      const { result } = (await res.json()) as { result?: Record<string, unknown> };
      const read = sanitizeCardRead(result ?? {});
      return isEmptyRead(read) ? { ok: false, reason: "unreadable" } : { ok: true, read };
    }
    const body = (await res.json().catch(() => ({}))) as { reason?: string; upstream?: string | null };
    if (body.reason === "quota") return { ok: false, reason: "quota" };
    if (body.reason === "limit") return { ok: false, reason: "limit" };
    const code = body.reason === "ai_failed" ? `ai_failed${body.upstream ? `_${body.upstream}` : ""}` : body.reason || `http_${res.status}`;
    return { ok: false, reason: "unavailable", why: aiFallbackText(code) };
  } catch (e) {
    return { ok: false, reason: "unavailable", why: e instanceof Error && e.name === "TimeoutError" ? "the AI reader took too long" : "no connection to the AI reader" };
  }
}

async function readOnPhone(file: File): Promise<CardRead | null> {
  try {
    const { runReceiptOcr } = await import("@/lib/ocr");
    const r = await Promise.race([runReceiptOcr(file, {}), new Promise<null>((res) => setTimeout(() => res(null), 40000))]);
    if (!r) return null;
    const read = parseCardText(r.rawText);
    return isEmptyRead(read) ? null : read;
  } catch { return null; }
}

/** Fills the gaps in `a` from `b`. */
function merge(a: CardRead, b: CardRead): CardRead {
  return { store: a.store ?? b.store, category: a.category ?? b.category, holder: a.holder ?? b.holder, number: a.number ?? b.number, format: a.format ?? b.format, fromBarcode: a.fromBarcode || b.fromBarcode };
}

/** Reads every photo given (front, back). The barcode wins for number and format; the AI (then the phone) fills the names. */
export async function readCard(files: File[]): Promise<CardScanOutcome> {
  let barcode: CardRead | null = null;
  for (const f of files) { barcode = await readBarcode(f); if (barcode) break; }
  let text: CardRead | null = null;
  let basic = false;
  let last: CardScanOutcome = { ok: false, reason: "unreadable" };
  for (const f of files) {
    const ai = await askAi(f);
    last = ai;
    if (ai.ok) { text = text ? merge(text, ai.read) : ai.read; if (text.store && text.number && text.holder) break; }
    else if (ai.reason === "quota" || ai.reason === "limit" || ai.reason === "offline") break;
  }
  if (!text) {
    for (const f of files) { const p = await readOnPhone(f); if (p) { text = text ? merge(text, p) : p; basic = true; } }
  }
  if (barcode && text) return { ok: true, read: { ...merge(barcode, text), number: barcode.number, format: barcode.format }, basic };
  if (barcode) return { ok: true, read: barcode };
  return text ? { ok: true, read: text, basic } : last;
}
