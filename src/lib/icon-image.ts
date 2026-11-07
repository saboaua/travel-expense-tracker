/** Turns any logo (PNG, JPG, SVG, WebP; transparent or not) into a square PNG on white with a little breathing room. */
export async function toIconPng(input: Buffer, size: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const pad = Math.round(size * 0.1);
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
