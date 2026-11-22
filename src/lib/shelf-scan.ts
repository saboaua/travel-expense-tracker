/** Sends a shelf label photo to the AI reader and says plainly what happened. The photo is not kept. */
import { compressReceiptImage } from "@/lib/compress-image";
import { aiFallbackText } from "@/lib/receipt-extract";
import { unreadable, type ShelfLabelScan } from "@/lib/shelf-label";

export type ShelfScanOutcome = { ok: true; scan: ShelfLabelScan } | { ok: false; reason: "offline" | "quota" | "limit" | "unavailable" | "unreadable"; why?: string };

export const SHELF_SCAN_MESSAGE: Record<Exclude<Extract<ShelfScanOutcome, { ok: false }>["reason"], never>, string> = {
  offline: "You are offline. Connect to scan, or type the price in.",
  quota: "Your AI scans for this month are used up. Type the price in instead.",
  limit: "Too many scans this hour. Type the price in, or try again later.",
  unavailable: "Scanning is not available right now. Type the price in instead.",
  unreadable: "Could not read this label. Hold the phone closer so the name and price fill the photo, and avoid glare.",
};

export async function scanShelfLabel(file: File, currency: string): Promise<ShelfScanOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
  let img = file;
  try { img = await compressReceiptImage(file, { maxSide: 2000, quality: 0.85 }); } catch { /* the server explains if it cannot use it */ }
  const form = new FormData();
  form.append("file", img);
  form.append("mode", "shelf");
  form.append("currency", currency);
  try {
    const res = await fetch("/api/ocr", { method: "POST", body: form, signal: AbortSignal.timeout(25000) });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("lifolio:ai-scan"));
    if (res.ok) {
      const { result } = (await res.json()) as { result?: ShelfLabelScan };
      return result && !unreadable(result) ? { ok: true, scan: result } : { ok: false, reason: "unreadable" };
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
