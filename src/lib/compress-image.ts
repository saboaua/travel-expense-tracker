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
