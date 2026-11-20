import { compressReceiptImage } from "@/lib/compress-image";

export const DOC_BUCKET = "documents";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
export const ALLOWED = new Set(DOC_ACCEPT.split(","));

export type DocQuality = "small" | "standard" | "sharp";
export const DOC_QUALITY: Record<DocQuality, { label: string; hint: string; maxSide: number; quality: number }> = {
  small: { label: "Small file", hint: "Smallest size, fine for tickets and bookings", maxSide: 1400, quality: 0.7 },
  standard: { label: "Standard", hint: "Recommended: clear text at a small size", maxSide: 2200, quality: 0.85 },
  sharp: { label: "Sharp", hint: "Best detail, larger file", maxSide: 3200, quality: 0.92 },
};

/** Photos the browser can draw to a canvas (HEIC cannot be cropped here). */
export function isCroppable(file: { type: string }): boolean {
  return /^image\/(jpeg|png|webp)$/.test(file.type);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function compressDocImage(file: File, q: DocQuality = "standard"): Promise<File> {
  const { maxSide, quality } = DOC_QUALITY[q];
  return compressReceiptImage(file, { maxSide, quality });
}

export const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";

export const dbMessage = (m: string) =>
  /document_number/i.test(m)
    ? "The document number column is missing. Run supabase/migration_documents_number.sql in Supabase."
    : /relation|schema cache/i.test(m)
      ? "Documents table not found. Run supabase/migration_documents.sql."
      : m;

/** Checks a chosen file and, for photos not already prepared by the form, compresses it. Used before saving or queuing. */
export async function prepareDocFile(original: File, prepared = false): Promise<File> {
  let file = original;
  if (!ALLOWED.has(file.type)) throw new Error("Use a PDF or a photo (JPG, PNG, WebP or HEIC).");
  if (!prepared && file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif") {
    file = await compressReceiptImage(file, { maxSide: 2200, quality: 0.85 }).catch(() => file);
  }
  if (file.size > MAX_DOC_BYTES) throw new Error("That file is over 10 MB. Use a smaller photo or PDF.");
  return file;
}
