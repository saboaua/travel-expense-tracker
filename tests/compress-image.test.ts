import { ALREADY_SMALL_BYTES, keepAsIs, targetSize } from "../src/lib/compress-image";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq(targetSize(3024, 5040), { width: 960, height: 1600 }, "a tall phone photo is cut to 1600 on the long side");
eq(targetSize(5040, 3024), { width: 1600, height: 960 }, "a wide photo too");
eq(targetSize(800, 1200), { width: 800, height: 1200 }, "a small picture is never made bigger");
eq(targetSize(1600, 1600), { width: 1600, height: 1600 }, "exactly at the limit stays");
eq(targetSize(10000, 1), { width: 1600, height: 1 }, "a thin strip never reaches zero pixels");
eq(targetSize(2000, 1000, 1200), { width: 1200, height: 600 }, "another limit can be given");

eq(keepAsIs("image/jpeg", 90 * 1024, 1200, 1600), true, "a small JPEG that is already the right size is kept");
eq(keepAsIs("image/webp", ALREADY_SMALL_BYTES, 1000, 1000), true, "a small WebP is kept");
eq(keepAsIs("image/jpeg", 90 * 1024, 3000, 4000), false, "small in bytes but too many pixels is still resized");
eq(keepAsIs("image/jpeg", 400 * 1024, 1200, 1600), false, "right size but heavy is saved again");
eq(keepAsIs("image/png", 50 * 1024, 800, 800), false, "a PNG is always converted");
eq(keepAsIs("image/heic", 50 * 1024, 800, 800), false, "so is a HEIC");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("compress-image: all checks passed");
