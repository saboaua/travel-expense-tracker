import type { BarcodeFormat } from "@/lib/loyalty";

export const LOYALTY_BUCKET = "loyalty-cards";
export const LOYALTY_ACCEPT = "image/jpeg,image/png,image/webp";
export const LOYALTY_MAX_SIDE = 800;
export const LOYALTY_QUALITY = 0.7;
const ALLOWED = new Set(LOYALTY_ACCEPT.split(","));

/** Biggest side after resizing: never enlarge, never above the limit. Pure, so it is tested. */
export function targetSize(width: number, height: number, maxSide = LOYALTY_MAX_SIDE): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxSide) return { width, height };
  const scale = maxSide / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type CompressedCard = { file: File; before: number; after: number };

/**
 * Card photos are always shrunk in the browser before they leave the phone: 800 px at most, WebP at quality 0.7
 * (JPEG where the browser cannot write WebP). The original is never uploaded.
 */
export async function compressCardImage(file: File): Promise<CompressedCard> {
  if (!ALLOWED.has(file.type)) throw new Error("Choose a JPG, PNG or WebP photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened. Try another one.");
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("This photo could not be processed.");
  }
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, LOYALTY_QUALITY));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("This photo could not be processed.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40) || "card";
  return { file: new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() }), before: file.size, after: blob.size };
}

export type CardInput = {
  store_name: string;
  holder_name?: string | null;
  category?: string | null;
  card_number: string;
  barcode_format: BarcodeFormat;
  color?: string | null;
};

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export const BACK_MIGRATION_MESSAGE = "The back photo could not be saved because the database is missing the back_image_path column. Run supabase/migration_loyalty_back.sql in the Supabase SQL Editor. The rest of the card was not changed.";

/** A photo slot: a new file to store, `null` to remove it, `undefined` to keep what is there. */
export type Photo = File | null | undefined;

export function rowOf(input: CardInput) {
  return {
    store_name: input.store_name.trim(),
    holder_name: clean(input.holder_name),
    category: clean(input.category),
    card_number: input.card_number,
    barcode_format: input.barcode_format,
    color: clean(input.color),
  };
}
