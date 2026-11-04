// Copies the on-device OCR files into public/tesseract so the app serves them itself.
// This lets the Content-Security-Policy allow only our own origin for scripts and workers (no CDN).
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "tesseract");
const need = (p) => {
  if (!existsSync(p)) {
    console.error(`copy-tesseract: missing ${p}. Run "npm install" first.`);
    process.exit(1);
  }
  return p;
};

mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

cpSync(need(join(root, "node_modules/tesseract.js/dist/worker.min.js")), join(out, "worker.min.js"));

const coreDir = need(join(root, "node_modules/tesseract.js-core"));
for (const f of readdirSync(coreDir)) {
  if (/^tesseract-core.*\.wasm\.js$/.test(f)) cpSync(join(coreDir, f), join(out, "core", f));
}

cpSync(need(join(root, "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz")), join(out, "lang", "eng.traineddata.gz"));
console.log("copy-tesseract: OCR files ready in public/tesseract");
