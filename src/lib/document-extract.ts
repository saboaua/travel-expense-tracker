import { compressReceiptImage } from "@/lib/compress-image";
import { runReceiptOcr } from "@/lib/ocr";
import { parseMrz, sanitizeDocumentFields, type DocumentFields } from "@/lib/mrz";

let aiUnavailable = false;

export type DocumentScan = { fields: DocumentFields; source: "ai" | "mrz" | "none" };

const EMPTY: DocumentFields = { kind: null, issuing_country: null, expiry_date: null, holder_name: null };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Reads a photo of a passport or other travel document so the form can be pre-filled.
 * 1) AI reading (accurate, needs the server key)  2) on-device OCR + passport MRZ lines (works without AI).
 * The result is only a suggestion: the form always lets the user correct it.
 */
export async function extractDocumentFields(file: File): Promise<DocumentScan> {
  // Sharper than receipts: the small machine-readable lines must stay legible
  let image = file;
  try {
    image = await compressReceiptImage(file, { maxSide: 2000, quality: 0.85 });
  } catch {
    // keep the original
  }

  if (!aiUnavailable) {
    try {
      const form = new FormData();
      form.append("file", image);
      form.append("mode", "document");
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      if (res.status === 503) aiUnavailable = true;
      else if (res.ok) {
        const { result } = (await res.json()) as { result?: Record<string, unknown> };
        const fields = sanitizeDocumentFields(result || {}, today());
        if (fields.expiry_date || fields.issuing_country || fields.holder_name) return { fields, source: "ai" };
      }
    } catch {
      // network problem: use on-device reading
    }
  }

  try {
    const ocr = await runReceiptOcr(image, {});
    const mrz = parseMrz(ocr.rawText || "");
    if (mrz) return { fields: sanitizeDocumentFields(mrz, today()), source: "mrz" };
  } catch {
    // unreadable image
  }
  return { fields: EMPTY, source: "none" };
}
