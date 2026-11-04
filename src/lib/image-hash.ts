/**
 * A tiny fingerprint of a photo ("difference hash"). Two photos of the same receipt, even re-saved, resized or cropped
 * a little, give fingerprints that differ in only a few bits; different receipts differ in many.
 * The fingerprint is 64 bits, written as 16 hex characters (what the database function compares).
 */

export const HASH_W = 9;
export const HASH_H = 8;

/** `gray` = HASH_W x HASH_H brightness values (0-255), row by row. Each bit says "is this pixel brighter than its right neighbour". */
export function dhashFromGray(gray: ArrayLike<number>): string {
  let bits = "";
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) bits += gray[y * HASH_W + x] > gray[y * HASH_W + x + 1] ? "1" : "0";
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Number of differing bits between two fingerprints (64 = completely different). */
export function hammingHex(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Fingerprint of an image file, or null if the browser cannot read it (then only the shop/date/amount check is used). */
export async function imageDhash(blob: Blob): Promise<string | null> {
  try {
    if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = HASH_W;
    canvas.height = HASH_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff"; // transparent pixels count as white paper
    ctx.fillRect(0, 0, HASH_W, HASH_H);
    ctx.drawImage(bmp, 0, 0, HASH_W, HASH_H);
    bmp.close?.();
    const { data } = ctx.getImageData(0, 0, HASH_W, HASH_H);
    const gray = new Array<number>(HASH_W * HASH_H);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const hash = dhashFromGray(gray);
    // A near-blank or washed-out photo says nothing about which receipt it is, so it is not used for matching.
    const ones = hammingHex(hash, "0000000000000000"); // number of 1 bits
    return ones >= 8 && ones <= 56 ? hash : null;
  } catch {
    return null;
  }
}
