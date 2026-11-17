/** Receipt photos are saved at most this many pixels on the long side: still easy to read, and enough for the text scan. */
export const RECEIPT_MAX_SIDE = 1600;
/** WebP at this quality is about 60% smaller than the JPEG at 0.8 we used before, with text just as readable. */
export const RECEIPT_WEBP_QUALITY = 0.72;
export const RECEIPT_JPEG_QUALITY = 0.8;
/** A picture already this small is kept as it is: shrinking it again would only lose quality. */
export const ALREADY_SMALL_BYTES = 120 * 1024;

/** Size to save at: never larger than the photo, never more than `maxSide` on the long side. */
export function targetSize(width: number, height: number, maxSide = RECEIPT_MAX_SIDE): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (!(longer > maxSide)) return { width, height };
  const scale = maxSide / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True when the picture is already small enough in both bytes and pixels that saving it again would not help. */
export function keepAsIs(type: string, bytes: number, width: number, height: number, maxSide = RECEIPT_MAX_SIDE): boolean {
  if (type !== "image/jpeg" && type !== "image/webp") return false;
  return bytes <= ALREADY_SMALL_BYTES && Math.max(width, height) <= maxSide;
}

const EXT_OF: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

/**
 * Resize and compress receipt photos for storage.
 * Targets ~1600px long side. Saved as WebP where the browser can make one (most of them), otherwise JPEG at 0.8.
 * Clear enough for print and for reading the text, at roughly 60-80 KB instead of 180 KB or more.
 */
export async function compressReceiptImage(
  file: File,
  options: { maxSide?: number; quality?: number } = {}
): Promise<File> {
  const maxSide = options.maxSide ?? RECEIPT_MAX_SIDE;

  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  if (keepAsIs(file.type, file.size, width, height, maxSide)) {
    bitmap.close();
    return file;
  }

  const { width: targetW, height: targetH } = targetSize(width, height, maxSide);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const encode = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  // Some browsers quietly hand back a PNG when they cannot make WebP, so the type that comes back is what counts.
  let blob = await encode("image/webp", options.quality ?? RECEIPT_WEBP_QUALITY);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", options.quality ?? RECEIPT_JPEG_QUALITY);
  if (!blob) return file;
  // Never save something bigger than what was picked (a small, already-tight picture).
  if (blob.size >= file.size && (file.type === "image/jpeg" || file.type === "image/webp") && targetW === width && targetH === height) return file;

  const type = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
  const base = file.name.replace(/\.[^.]+$/, "") || "receipt";
  return new File([blob], `${base}.${EXT_OF[type]}`, { type, lastModified: Date.now() });
}

/**
 * Profile photos: center-crop to a square, shrink to at most `size` px and save as JPEG.
 * A 12 MP phone photo becomes roughly 30-80 KB. Transparent areas are filled white
 * because JPEG has no alpha channel.
 */
export async function compressAvatarImage(
  file: File,
  options: { size?: number; quality?: number } = {}
): Promise<File> {
  const size = options.size ?? 512;
  const quality = options.quality ?? 0.85;

  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");

  // Respects the photo's EXIF rotation so portraits are not saved sideways
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  const out = Math.min(side, size);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process this image.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not process this image.");

  return new File([blob], "avatar.jpg", { type: "image/jpeg", lastModified: Date.now() });
}
