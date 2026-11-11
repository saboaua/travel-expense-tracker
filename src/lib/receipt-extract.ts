import { runReceiptOcr, type OcrHints, type OcrResult } from "@/lib/ocr";
import { bestItems } from "@/lib/ocr-layout";
import { applyFlags, checkGrocery, crossCheck, diffReadings } from "@/lib/receipt-check";
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

/** A sentence for the scan note about what the checks found: empty when everything lines up. */
export function scanNote(scan: Pick<GroceryScan, "items" | "check" | "refined">): string {
  const flagged = scan.items.filter((i) => i.flag).length;
  const parts: string[] = [];
  if (scan.refined) parts.push("The AI took a second look because the numbers did not add up.");
  if (scan.check?.issues[0]) parts.push(scan.check.issues[0]);
  if (flagged > 0) parts.push(`${flagged} ${flagged === 1 ? "price looks" : "prices look"} uncertain.`);
  return parts.join(" ");
}

/** What arrives after the first reading is already on screen. Row numbers refer to the items of the scan that was returned. */
export type LateUpdate = {
  flags: Record<number, string>;
  /** Another reader's price for a row, offered as a suggestion. */
  alts: Record<number, number>;
  /** Rows whose price both readers printed the same: confirmed. */
  agree: number[];
  /** Plain sentences about the receipt as a whole. */
  issues: string[];
  /** "ocr": the on-device reader compared prices; "ai": the AI took a second look. */
  from: "ocr" | "ai";
};

/**
 * Grocery receipts. The AI's items come back and are returned at once; nothing waits for anything else. In the
 * background the on-device reader reads the same photo as an independent witness and, when the receipt's own
 * arithmetic does not add up, the AI looks at the photo again. What they find reaches `onLater` as suggestions
 * for rows (flags and other prices): values are never changed on their own.
 * Without AI the on-device reading (rebuilt by word positions) is returned, with its rows checked and flagged.
 */
export async function extractGroceryReceipt(file: File, hints: OcrHints = {}, onLater?: (u: LateUpdate) => void): Promise<GroceryScan> {
  const sent = await forAi(file);
  const form = new FormData();
  form.append("file", sent);
  form.append("mode", "grocery");
  if (hints.currency) form.append("currency", hints.currency);
  if (hints.categories?.length) form.append("categories", JSON.stringify(hints.categories));

  const ocrPromise = runReceiptOcr(file, hints).catch(() => null);
  const ai = await askAi(form, (r: GroceryScan) => r.items.length > 0 || r.total != null);

  if (ai.result) {
    const scan = ai.result as GroceryScan;
    const check = scan.check ?? checkGrocery(scan);
    applyFlags(scan.items, check.flagged);
    const result: GroceryScan = { ...scan, check };

    if (onLater && scan.items.length > 0) {
      const snapshot = scan.items.map((i) => ({ ...i }));
      // Witness: the on-device reading of the same photo
      void ocrPromise.then((ocr) => {
        if (!ocr) return;
        const cross = crossCheck(snapshot, { text: ocr.rawText, items: bestItems(ocr.rawText, ocr.layout, ocr.amount) });
        const issues: string[] = [];
        if (cross.trusted && cross.extra.length > 0) issues.push(`The second reader also saw ${cross.extra.length === 1 ? `a price of ${cross.extra[0].toFixed(2)}` : `${cross.extra.length} prices`} that the AI did not list.`);
        if (cross.trusted) onLater({ flags: cross.flagged, alts: cross.alts, agree: cross.agreedRows, issues, from: "ocr" });
      });
      // Second look, only when the numbers do not add up
      if (!check.ok && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        const again = new FormData();
        again.append("file", sent);
        again.append("mode", "grocery-recheck");
        again.append("first", JSON.stringify(scan));
        if (hints.currency) again.append("currency", hints.currency);
        if (hints.categories?.length) again.append("categories", JSON.stringify(hints.categories));
        void fetch("/api/ocr", { method: "POST", body: again, signal: AbortSignal.timeout(AI_WAIT_MS) })
          .then(async (res) => {
            if (!res.ok) return;
            const { result: better } = (await res.json()) as { result?: GroceryScan | null };
            if (!better || better.items.length === 0) return;
            const d = diffReadings(snapshot, better.items);
            const issues = d.added > 0 ? [`The AI's second look found ${d.added} more ${d.added === 1 ? "line" : "lines"} on the receipt.`] : [];
            if (Object.keys(d.flagged).length > 0 || issues.length > 0) onLater({ flags: d.flagged, alts: d.alts, agree: [], issues, from: "ai" });
          })
          .catch(() => {});
      }
    }
    return result;
  }

  const ocr = (await ocrPromise) ?? (await runReceiptOcr(file, hints));
  const items = bestItems(ocr.rawText, ocr.layout, ocr.amount);
  const check = checkGrocery({ items, total: ocr.amount });
  // The reader's own doubt about a price counts too
  const doubt: Record<number, string> = {};
  items.forEach((it, i) => { if (it.conf != null && it.conf < 70) doubt[i] = "The reader was not sure of this price"; });
  applyFlags(items, check.flagged, doubt);
  return {
    store: ocr.merchant,
    date: ocr.date,
    total: ocr.amount,
    currency: ocr.currency,
    items,
    source: "tesseract",
    aiReason: ai.reason,
    check,
  };
}
