import { compressReceiptImage } from "@/lib/compress-image";
import { runReceiptOcr } from "@/lib/ocr";
import { parseMrz, sanitizeDocumentFields, type DocumentFields } from "@/lib/mrz";

let aiUnavailable = false;

export type DocumentScan = { fields: DocumentFields; source: "ai" | "mrz" | "none"; reason?: string };

const EMPTY: DocumentFields = { kind: null, document_number: null, issuing_country: null, expiry_date: null, holder_name: null };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Reads a photo of a passport or other travel document so the form can be pre-filled.
 * 1) AI reading (accurate, needs the server key)  2) on-device OCR + passport MRZ lines (works without AI).
 * The result is only a suggestion: the form always lets the user correct it.
 */
export async function extractDocumentFields(file: File): Promise<DocumentScan> {
  // Sharper than receipts: the small machine-readable lines must stay legible
  // (A photo that was already cropped and compressed in the form is sent as is: compressing twice blurs the small print.)
  let image = file;
  if (file.size > 1.5 * 1024 * 1024) {
    try {
      image = await compressReceiptImage(file, { maxSide: 2000, quality: 0.85 });
    } catch {
      // keep the original
    }
  }
  let reason: string | undefined;

  if (!aiUnavailable) {
    try {
      const form = new FormData();
      form.append("file", image);
      form.append("mode", "document");
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      if (res.status === 503) {
        aiUnavailable = true;
        reason = "not_configured";
      } else if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { reason?: string; upstream?: string | null };
        reason = body.reason === "ai_failed" ? `ai_failed${body.upstream ? `_${body.upstream}` : ""}` : body.reason || `http_${res.status}`;
      } else if (res.ok) {
        const { result } = (await res.json()) as { result?: Record<string, unknown> };
        const fields = sanitizeDocumentFields(result || {}, today());
        if (fields.expiry_date || fields.issuing_country || fields.holder_name || fields.document_number) return { fields, source: "ai" };
        reason = "ai_empty";
      }
    } catch {
      reason = "network";
    }
  } else {
    reason = "not_configured";
  }

  try {
    const ocr = await runReceiptOcr(image, {});
    const mrz = parseMrz(ocr.rawText || "");
    if (mrz) return { fields: sanitizeDocumentFields(mrz, today()), source: "mrz" };
  } catch {
    // unreadable image
  }
  return { fields: EMPTY, source: "none", reason };
}

/** Plain-language explanation for a failed scan. */
export function scanFailureMessage(reason?: string): string {
  const tip = " Retake it flat and well lit with the whole page in view (including the two lines of < < < at the bottom), or enter the details below.";
  if (reason === "not_configured") return "AI reading is not set up on the server (ANTHROPIC_API_KEY is missing), and the passport's printed lines could not be read on this device." + tip;
  if (reason === "limit") return "Too many scans this hour. Enter the details below or try again later.";
  if (reason?.startsWith("ai_failed")) {
    const code = reason.split("_")[2];
    return `The AI reader returned an error${code ? ` (${code})` : ""}, and the printed lines could not be read on this device.` + tip;
  }
  if (reason === "ai_empty") return "The AI reader could not find the details in this photo." + tip;
  if (reason === "network") return "Could not reach the reading service (network problem)." + tip;
  return "Could not read the details from this photo." + tip;
}
