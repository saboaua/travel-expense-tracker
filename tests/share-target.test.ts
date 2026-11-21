import { existsSync } from "node:fs";
import { join } from "node:path";
import { isShareable, SHARE_CACHE } from "../src/lib/share-target";
import { startupImages } from "../src/lib/splash";
import { readFileSync } from "node:fs";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq(isShareable("r.jpg", "image/jpeg"), true, "a photo can be shared in");
eq(isShareable("r.pdf", "application/pdf"), true, "a PDF can be shared in");
eq(isShareable("IMG_1.HEIC", ""), true, "a photo with no type is recognised by its name");
eq(isShareable("notes.txt", "text/plain"), false, "other files are not taken");
eq(isShareable("clip.mp4", "video/mp4"), false, "a video is not taken");

// The service worker keeps the file under the same cache name the app reads it from
const sw = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");
eq(sw.includes(`const SHARE = "${SHARE_CACHE}"`), true, "the service worker and the app use the same cache name");
eq(sw.includes('"/share-target"') && sw.includes("/shared-file"), true, "the service worker answers /share-target and keeps the file where the app looks");

// Every opening screen the page links to exists as a file
const missing = startupImages.map((s) => s.url).filter((u) => !existsSync(join(__dirname, "..", "public", u)));
eq(missing, [], "every opening screen image exists");
eq(startupImages.some((s) => s.url === "/splash/launch-1260x2736.png"), true, "the iPhone Air has an opening screen");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
