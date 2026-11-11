/**
 * Pixel clean-up for receipt photos before OCR. Pure functions on grey-level arrays, so they run in the
 * browser (canvas pixels) and in tests alike.
 *
 * Why two versions: a contrast stretch is enough for an even, bright photo, but thermal paper under a
 * shadow or a lamp has a brightness gradient across the page. A local (adaptive) threshold turns that
 * into clean black text on white wherever the light falls, which Tesseract reads far better.
 */

export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  return out;
}

/** Stretches the brightness so the darkest 2% become black and the lightest 2% white. */
export function stretchContrast(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const cut = gray.length * 0.02;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break; } }
  const range = Math.max(hi - lo, 1);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = ((gray[i] - lo) * 255) / range;
  return out;
}

/**
 * Black where a pixel is clearly darker than the average of its neighbourhood, white elsewhere.
 * `window` is the neighbourhood size in pixels (about 1/12 of the shorter side suits receipts) and
 * `bias` how much darker than that average a pixel has to be (0.2 = 20%).
 */
export function adaptiveBinarize(gray: Uint8ClampedArray, w: number, h: number, opts: { window?: number; bias?: number } = {}): Uint8ClampedArray {
  const win = Math.max(15, (opts.window ?? Math.round(Math.min(w, h) / 12)) | 1);
  const bias = opts.bias ?? 0.2;
  const half = win >> 1;
  // Integral image: sum of any rectangle in four reads
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + row;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean * (1 - bias) ? 0 : 255;
    }
  }
  return out;
}

export function grayToRgba(gray: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = gray[i];
    out[j + 3] = 255;
  }
  return out;
}

/**
 * How much to scale a photo before OCR. Small photos are enlarged so a letter is tall enough to read
 * (Tesseract wants roughly 25 px between baseline and cap height), huge ones are shrunk so a phone
 * does not run out of memory. The result never exceeds about 6 million pixels.
 */
export function ocrScale(width: number, height: number): number {
  const longer = Math.max(width, height);
  const shorter = Math.min(width, height);
  let scale = longer < 1400 ? 1800 / longer : longer > 2600 ? 2600 / longer : 1;
  // A narrow, tall receipt strip (a long grocery slip) needs its width, not its length, to be generous
  if (shorter * scale < 900 && longer * (900 / shorter) <= 4200) scale = Math.max(scale, 900 / shorter);
  const pixels = width * height * scale * scale;
  if (pixels > 6_000_000) scale *= Math.sqrt(6_000_000 / pixels);
  return scale;
}

export type GrayImage = { gray: Uint8ClampedArray; w: number; h: number };

/** Turns a grey image clockwise by quarter turns (1 = 90°, 2 = 180°, 3 = 270°). */
export function rotateGray(img: GrayImage, quarterTurns: number): GrayImage {
  const q = ((quarterTurns % 4) + 4) % 4;
  const { gray, w, h } = img;
  if (q === 0) return img;
  const out = new Uint8ClampedArray(gray.length);
  if (q === 2) {
    for (let i = 0; i < gray.length; i++) out[gray.length - 1 - i] = gray[i];
    return { gray: out, w, h };
  }
  // 90° and 270° swap width and height
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      if (q === 1) out[x * h + (h - 1 - y)] = v; // (x, y) -> (h-1-y, x)
      else out[(w - 1 - x) * h + y] = v; // (x, y) -> (y, w-1-x)
    }
  }
  return { gray: out, w: h, h: w };
}

/** A smaller copy (nearest neighbour is enough to judge the direction of text). */
export function downscaleGray(img: GrayImage, maxSide: number): GrayImage {
  const longer = Math.max(img.w, img.h);
  if (longer <= maxSide) return img;
  const s = maxSide / longer;
  const w = Math.max(1, Math.round(img.w * s));
  const h = Math.max(1, Math.round(img.h * s));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor(y / s));
    for (let x = 0; x < w; x++) out[y * w + x] = img.gray[sy * img.w + Math.min(img.w - 1, Math.floor(x / s))];
  }
  return { gray: out, w, h };
}

/**
 * Which quarter turn makes the text read best. `score` reads an image and says how good the reading is; the turn
 * must beat the upright photo by `margin` points to be chosen, so a normal photo is never rotated by mistake.
 */
export async function pickRotation(img: GrayImage, score: (img: GrayImage) => Promise<number>, margin = 15): Promise<{ turns: number; scores: number[] }> {
  const scores: number[] = [];
  for (const q of [0, 1, 2, 3]) scores.push(await score(rotateGray(img, q)));
  let best = 0;
  for (let q = 1; q < 4; q++) if (scores[q] > scores[best]) best = q;
  return { turns: best !== 0 && scores[best] >= scores[0] + margin ? best : 0, scores };
}

/**
 * True when part of the text area is washed out by a reflection or a flash. The photo is cut into small tiles;
 * a tile counts as blown out when almost every pixel is white. Only tiles inside the box around the printed text
 * count, so the plain white margin of a bright photo does not trigger it.
 */
export function hasGlare(img: GrayImage, tile = 16): boolean {
  const { gray, w, h } = img;
  const tx = Math.floor(w / tile), ty = Math.floor(h / tile);
  if (tx < 4 || ty < 4) return false;
  const blown = new Uint8Array(tx * ty);
  const ink = new Uint8Array(tx * ty);
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      let white = 0, dark = 0;
      for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
        const v = gray[(j * tile + y) * w + i * tile + x];
        if (v >= 250) white++;
        else if (v < 120) dark++;
      }
      const n = tile * tile;
      if (white / n >= 0.97) blown[j * tx + i] = 1;
      if (dark / n >= 0.02) ink[j * tx + i] = 1;
    }
  }
  let x0 = tx, x1 = -1, y0 = ty, y1 = -1, inkTiles = 0;
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) if (ink[j * tx + i]) { inkTiles++; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  if (inkTiles < 12) return false;
  let inside = 0, bad = 0;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { inside++; if (blown[j * tx + i]) bad++; }
  return bad / inside >= 0.12;
}
