import sharp from "sharp";

export const PHOTO_MAX_WIDTH = 960;

/**
 * Destination photos come from Wikimedia at up to 1280 px wide, but the card showing them is never wider than about 900 px
 * on the largest screens (and 400 px on a phone). Shrinking them here sends roughly a third of the bytes.
 * If the picture cannot be converted it is sent as it is.
 */
export async function shrinkPhoto(bytes: ArrayBuffer | Uint8Array, maxWidth = PHOTO_MAX_WIDTH): Promise<{ body: Uint8Array; type: string; shrunk: boolean }> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    const out = await sharp(input, { failOn: "error" }).rotate().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
    if (out.byteLength < input.byteLength) return { body: new Uint8Array(out), type: "image/webp", shrunk: true };
  } catch {
    // fall through
  }
  return { body: input, type: "", shrunk: false };
}
