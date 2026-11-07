import sharp from "sharp";
import { PHOTO_MAX_WIDTH, shrinkPhoto } from "../src/lib/photo-resize";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (a !== b) { fail++; console.error(`FAIL ${m}: got ${a}, want ${b}`); } };

(async () => {
  // A busy 1280x800 picture, as Wikimedia sends it
  const raw = Buffer.alloc(1280 * 800 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7 + ((i >> 5) % 251)) & 255;
  const big = await sharp(raw, { raw: { width: 1280, height: 800, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

  const r = await shrinkPhoto(big);
  const meta = await sharp(r.body).metadata();
  eq("shrunk", r.shrunk, true);
  eq("webp", r.type, "image/webp");
  eq("width capped", meta.width, PHOTO_MAX_WIDTH);
  eq("proportions kept", meta.height, Math.round((800 * PHOTO_MAX_WIDTH) / 1280));
  eq("fewer bytes", r.body.byteLength < big.byteLength, true);

  // A small picture is never enlarged
  const tiny = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).png().toBuffer();
  const t = await shrinkPhoto(tiny);
  eq("small picture keeps its size", t.shrunk ? (await sharp(t.body).metadata()).width : 300, 300);

  // Not a picture: handed back untouched
  const junk = new Uint8Array([1, 2, 3, 4, 5]);
  const j = await shrinkPhoto(junk);
  eq("junk is returned as is", j.shrunk, false);
  eq("junk bytes untouched", j.body, junk);

  if (fail) process.exit(1);
  console.log("photo-resize checks passed");
})();
