/** How much of the square the logo fills. A maskable icon is cropped to a circle or rounded shape on some Android phones,
 * so its logo must stay inside the central circle: half the diagonal of the logo square has to fit in 40% of the width. */
export const ICON_SCALE = 0.8;
export const MASKABLE_SCALE = 0.56;

/** Turns any logo (PNG, JPG, SVG, WebP; transparent or not) into a square PNG on white with room around it. */
export async function toIconPng(input: Buffer, size: number, scale = ICON_SCALE): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const pad = Math.round((size * (1 - scale)) / 2);
  const inner = await sharp(input, { density: 300 })
    .resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .composite([{ input: inner }])
    .removeAlpha()
    .png()
    .toBuffer();
}
