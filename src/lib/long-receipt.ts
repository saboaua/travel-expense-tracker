import { encodeReceiptCanvas } from "@/lib/compress-image";

/**
 * Long receipts: several photos taken from the top down are laid together into one tall image.
 * The end of each photo repeats the first lines of the next one; those lines are found by comparing the two
 * (as small grey pictures) and are only drawn once.
 */

export const MAX_PARTS = 6;
/** Joined receipts are named like this, so the pages they are handed to know not to crop or squeeze them again. */
export const JOINED_NAME = "long-receipt";
export const isJoinedReceipt = (f: File) => f.name.startsWith(JOINED_NAME + ".");
/** The joined receipt is saved at most this wide and this tall (pixels). Wide enough to read, never huge. */
export const JOIN_MAX_WIDTH = 1000;
export const JOIN_MAX_HEIGHT = 6000;
/** Photos are compared at this width. */
export const MATCH_WIDTH = 240;

export type Gray = { w: number; h: number; data: ArrayLike<number> };
export type Overlap = { rows: number; score: number };

/**
 * How many rows at the top of `b` repeat the bottom of `a`, or null when no stretch looks the same.
 * Both pictures must have the same width. Compares every possible overlap and keeps the one that matches best
 * (normalised correlation, so a darker or brighter second photo does not matter). Blank paper never counts as a match.
 */
export function findOverlap(a: Gray, b: Gray, o: { minRows?: number; minScore?: number } = {}): Overlap | null {
  if (a.w !== b.w || a.w < 1) return null;
  const w = a.w;
  const minRows = o.minRows ?? 18;
  const minScore = o.minScore ?? 0.75;
  const maxRows = Math.floor(Math.min(a.h, b.h) * 0.9);
  let best: Overlap | null = null;
  for (let r = minRows; r <= maxRows; r++) {
    const aStart = (a.h - r) * w;
    const n = r * w;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < n; i++) {
      const x = a.data[aStart + i];
      const y = b.data[i];
      sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
    }
    const va = saa - (sa * sa) / n;
    const vb = sbb - (sb * sb) / n;
    // Almost no variation means blank paper: nothing to line up on
    if (va / n < 64 || vb / n < 64) continue;
    const score = (sab - (sa * sb) / n) / Math.sqrt(va * vb);
    if (score >= minScore && (!best || score > best.score)) best = { rows: r, score };
  }
  return best;
}

export type JoinPlan = {
  width: number;
  height: number;
  /** One entry per part: where it is drawn, how tall, and how many of its top rows are skipped (already drawn). */
  parts: { y: number; drawH: number; skip: number; scaledH: number }[];
  /** y of each join, for marking them on the preview. */
  joins: number[];
};

/**
 * Sizes for the joined picture. `sizes` are the photos' pixel sizes, `overlaps` the rows (at MATCH_WIDTH) that part i+1
 * shares with part i (0 when they are put one under the other). Everything is scaled to one width, and to fit the maximum height.
 */
export function planJoin(sizes: { w: number; h: number }[], overlaps: number[], maxW = JOIN_MAX_WIDTH, maxH = JOIN_MAX_HEIGHT): JoinPlan {
  const width0 = Math.max(1, Math.min(maxW, ...sizes.map((s) => s.w)));
  const build = (width: number): JoinPlan => {
    const parts: JoinPlan["parts"] = [];
    const joins: number[] = [];
    let y = 0;
    sizes.forEach((s, i) => {
      const scaledH = Math.max(1, Math.round((s.h * width) / s.w));
      const skip = i === 0 ? 0 : Math.min(scaledH - 1, Math.max(0, Math.round(((overlaps[i - 1] ?? 0) * width) / MATCH_WIDTH)));
      if (i > 0) joins.push(y);
      parts.push({ y, drawH: scaledH - skip, skip, scaledH });
      y += scaledH - skip;
    });
    return { width, height: y, parts, joins };
  };
  let plan = build(width0);
  if (plan.height > maxH) plan = build(Math.max(1, Math.floor((width0 * maxH) / plan.height)));
  return plan;
}

/* ------------------------------------------------------------------ */
/* Browser only                                                        */
/* ------------------------------------------------------------------ */

export type JoinResult =
  | { ok: true; file: File; joins: number[]; width: number; height: number; preview: string }
  | { ok: false; reason: "no-match"; between: number } // part `between` and `between + 1` (0-based) share no lines
  | { ok: false; reason: "failed" };

async function loadBitmaps(files: File[]): Promise<ImageBitmap[]> {
  return Promise.all(files.map((f) => createImageBitmap(f, { imageOrientation: "from-image" })));
}

function grayOf(bitmap: ImageBitmap): Gray {
  const h = Math.max(1, Math.round((bitmap.height * MATCH_WIDTH) / bitmap.width));
  const canvas = document.createElement("canvas");
  canvas.width = MATCH_WIDTH;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, MATCH_WIDTH, h);
  const px = ctx.getImageData(0, 0, MATCH_WIDTH, h).data;
  const data = new Uint8Array(MATCH_WIDTH * h);
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
  return { w: MATCH_WIDTH, h, data };
}

/**
 * Joins the photos (in order, top first) into one saved image. With `force` a pair that cannot be matched is put one
 * under the other instead of stopping.
 */
export async function joinParts(files: File[], opts: { force?: boolean; known?: (number | null)[] } = {}): Promise<JoinResult> {
  if (files.length < 2) return { ok: false, reason: "failed" };
  let bitmaps: ImageBitmap[] = [];
  try {
    bitmaps = await loadBitmaps(files);
    const grays = bitmaps.map(grayOf);
    const overlaps: number[] = [];
    for (let i = 0; i < grays.length - 1; i++) {
      const hit = findOverlap(grays[i], grays[i + 1]);
      if (hit) overlaps.push(hit.rows);
      else if (opts.force) overlaps.push(0);
      else return { ok: false, reason: "no-match", between: i };
    }
    const plan = planJoin(bitmaps.map((b) => ({ w: b.width, h: b.height })), overlaps);
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "failed" };
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, plan.width, plan.height);
    bitmaps.forEach((bm, i) => {
      const p = plan.parts[i];
      const srcSkip = (p.skip * bm.height) / p.scaledH;
      ctx.drawImage(bm, 0, srcSkip, bm.width, bm.height - srcSkip, 0, p.y, plan.width, p.drawH);
    });
    const file = await encodeReceiptCanvas(canvas, JOINED_NAME);
    if (!file) return { ok: false, reason: "failed" };
    return { ok: true, file, joins: plan.joins, width: plan.width, height: plan.height, preview: URL.createObjectURL(file) };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    bitmaps.forEach((b) => b.close());
  }
}
