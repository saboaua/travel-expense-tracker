import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

// Every page gets its own tab title: from the page, or from a layout above it (inside the same section).
const ROOT = join(process.cwd(), "src/app");
const has = (f: string) => existsSync(f) && /export const metadata|export async function generateMetadata|export function generateMetadata/.test(readFileSync(f, "utf8"));
const pages: string[] = [];
(function walk(d: string) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === "page.tsx") pages.push(p); } })(ROOT);

let failed = 0;
const missing: string[] = [];
for (const p of pages) {
  const rel = dirname(p).slice(ROOT.length) || "/";
  if (rel === "/" || rel === "/(dashboard)") continue; // the home page uses the app name
  let d = dirname(p), ok = false;
  while (d.length > ROOT.length) { if (has(join(d, "page.tsx")) || has(join(d, "layout.tsx"))) { ok = true; break; } d = dirname(d); }
  if (!ok) missing.push(rel);
}
if (missing.length) { failed++; console.log(`FAIL pages with no tab title: ${missing.join(", ")}`); } else console.log("PASS every page has a tab title");
if (failed) process.exit(1);
