/**
 * Resize and compress receipt photos for storage.
 * Targets ~1600px long side and JPEG quality 0.8 — clear enough for print/OCR
 * while keeping file size small.
 */
export async function compressReceiptImage(
  file: File,
  options: { maxSide?: number; quality?: number } = {}
): Promise<File> {
  const maxSide = options.maxSide ?? 1600;
  const quality = options.quality ?? 0.8;

  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetW = width;
  let targetH = height;
  const longer = Math.max(width, height);
  if (longer > maxSide) {
    const scale = maxSide / longer;
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "receipt";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
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
