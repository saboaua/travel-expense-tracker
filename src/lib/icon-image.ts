/** How much of the square a logo that has no background of its own (a symbol on transparent) fills. */
export const ICON_SCALE = 0.8;
/** A maskable icon is cropped to a circle or rounded shape on some Android phones, so a symbol must stay inside the central circle:
 * half the diagonal of the symbol's square has to fit in 40% of the width. */
export const MASKABLE_SCALE = 0.56;
/** A logo that is a solid tile (like a dark rounded square) fills the whole icon; as a maskable icon it keeps a little room. */
export const TILE_MASKABLE_SCALE = 0.72;

type RGB = { r: number; g: number; b: number };

/** The colour along the edges of the logo when it is a solid tile, otherwise null (transparent or mixed edges). */
export async function tileColour(input: Buffer): Promise<RGB | null> {
  const sharp = (await import("sharp")).default;
  const N = 64;
  const { data } = await sharp(input, { density: 300 })
    .resize(N, N, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => ({ r: data[(y * N + x) * 4], g: data[(y * N + x) * 4 + 1], b: data[(y * N + x) * 4 + 2], a: data[(y * N + x) * 4 + 3] });
  // Points just inside the middle of each side. Corners are skipped: a rounded tile is transparent there.
  const points: [number, number][] = [];
  for (const o of [-10, -4, 0, 4, 10]) points.push([N / 2 + o, 4], [N / 2 + o, N - 5], [4, N / 2 + o], [N - 5, N / 2 + o]);
  const found = points.map(([x, y]) => px(x, y));
  const solid = found.filter((p) => p.a > 240);
  if (solid.length < found.length * 0.9) return null; // the logo does not reach the edges: it is a symbol, not a tile
  const avg = (k: "r" | "g" | "b") => Math.round(solid.reduce((s, p) => s + p[k], 0) / solid.length);
  const colour = { r: avg("r"), g: avg("g"), b: avg("b") };
  // The edges must agree with each other, or the logo is not one flat tile
  const spread = Math.max(...solid.map((p) => Math.abs(p.r - colour.r) + Math.abs(p.g - colour.g) + Math.abs(p.b - colour.b)));
  return spread > 120 ? null : colour;
}

/**
 * Turns any logo (PNG, JPG, SVG, WebP; transparent or not) into a square PNG for the home screen.
 * - A logo that is a solid tile fills the whole square, with its own colour behind its rounded corners, so there is no white frame.
 *   (iPhones round the corners themselves.)
 * - A symbol on a transparent background goes on white with room around it.
 * Maskable icons keep extra room so Android can crop them without cutting the logo.
 */
export async function toIconPng(input: Buffer, size: number, opts: { maskable?: boolean } = {}): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const tile = await tileColour(input);
  const scale = tile ? (opts.maskable ? TILE_MASKABLE_SCALE : 1) : opts.maskable ? MASKABLE_SCALE : ICON_SCALE;
  const side = Math.round(size * scale);
  const pad = Math.round((size - side) / 2);
  const bg = tile ?? { r: 255, g: 255, b: 255 };
  const inner = await sharp(input, { density: 300 })
    .resize(side, side, { fit: "contain", background: { r: bg.r, g: bg.g, b: bg.b, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: inner, left: pad, top: pad }])
    .removeAlpha()
    .png()
    .toBuffer();
}
