import sharp from "sharp";
import { iconVersion } from "../src/lib/brand-icon";
import { toIconPng } from "../src/lib/icon-image";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

/* ---- the version follows the logo address ---- */
eq(iconVersion(null), "0", "no logo: version 0");
const a = iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=1");
const b = iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=2");
eq([a === iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=1"), a !== b, a !== "0"], [true, true, true], "same address, same version; a new upload, a new version");

(async () => {
  const wide = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#e11d48"/></svg>');
  for (const [name, input] of [
    ["svg", wide],
    ["png with transparency", await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()],
    ["jpeg", await sharp({ create: { width: 250, height: 250, channels: 3, background: "#2563eb" } }).jpeg().toBuffer()],
    ["webp", await sharp({ create: { width: 120, height: 300, channels: 3, background: "#16a34a" } }).webp().toBuffer()],
  ] as [string, Buffer][]) {
    const png = await toIconPng(input, 180);
    const meta = await sharp(png).metadata();
    eq([meta.format, meta.width, meta.height, meta.hasAlpha], ["png", 180, 180, false], `${name}: a 180 square PNG with no transparency`);
    const corner = await sharp(png).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    eq([...corner], [255, 255, 255], `${name}: the corner is white, not black`);
  }
  const big = await toIconPng(wide, 512);
  eq((await sharp(big).metadata()).width, 512, "512 size");
  console.log(failed ? `${failed} FAILED` : "all icon checks passed");
  process.exit(failed ? 1 : 0);
})();
