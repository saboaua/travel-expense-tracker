/** A business logo for reports: shrunk to at most `max` px on the long side, keeping its shape and any transparent background. */
export async function resizeLogo(file: File, max = 480): Promise<{ blob: Blob; ext: "png" | "jpg" }> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a PNG or JPG picture.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("This picture could not be processed."); }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (png && png.size <= 400_000) return { blob: png, ext: "png" };
  // a large photo-like logo is smaller as JPEG (white behind any transparent part)
  const flat = document.createElement("canvas");
  flat.width = w; flat.height = h;
  const fctx = flat.getContext("2d")!;
  fctx.fillStyle = "#fff"; fctx.fillRect(0, 0, w, h); fctx.drawImage(canvas, 0, 0);
  const jpg = await new Promise<Blob | null>((r) => flat.toBlob(r, "image/jpeg", 0.9));
  if (!jpg) throw new Error("This picture could not be processed.");
  return { blob: jpg, ext: "jpg" };
}
