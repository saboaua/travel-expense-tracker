import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ICON_RENDER, ICON_RENDER_SOURCE_FINGERPRINT, iconHref, iconVersion, manifestHref } from "../src/lib/brand-icon";
import { toIconPng, tileColour } from "../src/lib/icon-image";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const near = (a: number[], b: number[], tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const pixel = async (png: Buffer, x: number, y: number) => [...(await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];

/* ---- the version follows the logo address ---- */
eq(iconVersion(null), "0", "no logo: version 0");
const a = iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=1");
const b = iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=2");
eq([a === iconVersion("https://x.supabase.co/storage/v1/object/public/branding/logo.png?t=1"), a !== b, a !== "0"], [true, true, true], "same address, same version; a new upload, a new version");

/* ---- icon links must change whenever the drawing code changes (phones and the CDN keep them for a day) ---- */
const fingerprint = createHash("sha1").update(readFileSync(new URL("../src/lib/icon-image.ts", import.meta.url))).digest("hex").slice(0, 8);
eq(fingerprint, ICON_RENDER_SOURCE_FINGERPRINT, `icon-image.ts changed: raise ICON_RENDER (now ${ICON_RENDER}) and set ICON_RENDER_SOURCE_FINGERPRINT to "${fingerprint}" in src/lib/brand-icon.ts`);
eq(iconHref("https://x/logo.png", 180).includes(`v=${iconVersion("https://x/logo.png")}${ICON_RENDER}&size=180`), true, "the icon link carries the logo version and the render number");
eq(iconHref(null, 512, true), `/api/icon?v=0${ICON_RENDER}&size=512&maskable=1`, "the maskable link");

/* ---- the manifest link changes whenever the manifest would, so it can be cached for a day ---- */
const base = { logoUrl: "https://x/logo.png", appName: "Lifolio", primaryColor: "#4f46e5" };
eq(manifestHref(base) === manifestHref({ ...base }), true, "same settings, same manifest link");
eq(manifestHref(base) !== manifestHref({ ...base, appName: "Other" }), true, "a new name changes the manifest link");
eq(manifestHref(base) !== manifestHref({ ...base, primaryColor: "#000000" }), true, "a new colour changes the manifest link");
eq(manifestHref(base) !== manifestHref({ ...base, logoUrl: "https://x/new.png" }), true, "a new logo changes the manifest link");
eq(manifestHref(base).startsWith("/api/manifest?v="), true, "manifest link shape");

/* A dark rounded tile with a light symbol and transparent corners: like the Lifolio logo */
const tileSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" rx="80" fill="#0b1a3a"/><rect x="120" y="100" width="90" height="200" fill="#3b82f6"/><rect x="190" y="220" width="110" height="70" fill="#67e8f9"/></svg>');
/* A symbol on a transparent background */
const symbolSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="110" fill="#e11d48"/></svg>');

(async () => {
  /* ---- which logos count as a solid tile ---- */
  const tc = await tileColour(tileSvg);
  eq(!!tc && near([tc.r, tc.g, tc.b], [11, 26, 58]), true, "a rounded dark tile is recognised, with its own colour");
  eq(await tileColour(symbolSvg), null, "a symbol on transparent is not a tile");
  eq(await tileColour(await sharp({ create: { width: 250, height: 250, channels: 3, background: "#2563eb" } }).jpeg().toBuffer()) !== null, true, "a flat JPEG is a tile");

  /* ---- a tile fills the whole icon: no white frame ---- */
  for (const size of [180, 512]) {
    const png = await toIconPng(tileSvg, size);
    const meta = await sharp(png).metadata();
    eq([meta.format, meta.width, meta.height, meta.hasAlpha], ["png", size, size, false], `tile ${size}: a square PNG with no transparency`);
    eq(near(await pixel(png, 0, 0), [11, 26, 58]), true, `tile ${size}: the corner has the tile's own colour, not white`);
    eq(near(await pixel(png, size - 1, size - 1), [11, 26, 58]), true, `tile ${size}: the far corner too`);
    eq(near(await pixel(png, Math.round(size * 0.4), Math.round(size * 0.5)), [59, 130, 246]), true, `tile ${size}: the symbol is at full size (a white-framed icon would shrink it)`);
  }

  /* ---- a symbol on transparent goes on white with room around it ---- */
  const sym = await toIconPng(symbolSvg, 180);
  eq([(await pixel(sym, 0, 0)), (await sharp(sym).metadata()).hasAlpha], [[255, 255, 255], false], "symbol: white corner, no transparency");
  eq(near(await pixel(sym, 90, 90), [225, 29, 72]), true, "symbol: the symbol is in the middle");

  /* ---- other formats still work ---- */
  for (const [name, input] of [
    ["png with transparency", await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()],
    ["webp", await sharp({ create: { width: 120, height: 300, channels: 3, background: "#16a34a" } }).webp().toBuffer()],
    ["wide svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#e11d48"/></svg>')],
  ] as [string, Buffer][]) {
    const png = await toIconPng(input, 180);
    const meta = await sharp(png).metadata();
    eq([meta.format, meta.width, meta.height, meta.hasAlpha], ["png", 180, 180, false], `${name}: a 180 square PNG with no transparency`);
  }

  /* ---- maskable: nothing important is cut by a circular crop ---- */
  const maskTile = await toIconPng(tileSvg, 512, { maskable: true });
  eq(near(await pixel(maskTile, 0, 0), [11, 26, 58]), true, "maskable tile: same colour all around, no white");
  // the light symbol must sit inside the circle of radius 40% of the width
  const { data, info } = await sharp(maskTile).raw().toBuffer({ resolveWithObject: true });
  let far = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    if (data[i + 2] > 200) far = Math.max(far, Math.hypot(x - 256, y - 256)); // the blue and cyan symbol
  }
  eq(far <= 0.4 * 512, true, `maskable tile: the symbol stays inside the safe circle (${Math.round(far)} of ${Math.round(0.4 * 512)})`);

  const maskSym = await toIconPng(symbolSvg, 512, { maskable: true });
  const sd = await sharp(maskSym).raw().toBuffer({ resolveWithObject: true });
  let symFar = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const i = (y * 512 + x) * sd.info.channels; if (sd.data[i + 1] < 100) symFar = Math.max(symFar, Math.hypot(x - 256, y - 256)); }
  eq(symFar <= 0.4 * 512, true, "maskable symbol: inside the safe circle");
  eq(near(await pixel(maskSym, 0, 0), [255, 255, 255]), true, "maskable symbol: white background");

  console.log(failed ? `${failed} FAILED` : "all icon checks passed");
  process.exit(failed ? 1 : 0);
})();
