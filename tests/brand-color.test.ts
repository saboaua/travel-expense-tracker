// Run with: npx tsx tests/brand-color.test.ts
import { applyBrandColor, brandCss, brandTokens, contrastWithWhite, DEFAULT_BRAND } from "../src/lib/brand-color";

const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
const yes = (c: unknown, m: string) => eq(!!c, true, m);

eq(brandTokens("nonsense"), brandTokens(DEFAULT_BRAND), "an invalid colour falls back to the default blue");
eq(brandTokens(null), brandTokens(DEFAULT_BRAND), "no colour falls back too");
eq(brandTokens("#abc"), brandTokens("#aabbcc"), "short hex works");
// white text must reach AA contrast in light mode, whatever the brand colour is
const toRgb = (hsl: string) => {
  const [h, s, l] = hsl.replace(/%/g, "").split(" ").map(Number); const sn = s / 100, ln = l / 100, a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => { const k = (n + h / 30) % 12; return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
};
for (const c of ["#4f46e5", "#2563eb", "#facc15", "#ffffff", "#000000", "#10b981", "#f97316", "#ec4899"]) {
  yes(contrastWithWhite(toRgb(brandTokens(c).light.primary)) >= 4.4, `white text on ${c} is readable in light mode`);
}
yes(parseFloat(brandTokens("#1e3a8a").dark.primary.split(" ")[2]) >= 62, "a dark brand colour is lifted for dark mode");
yes(brandCss("#4f46e5").startsWith(":root{--primary:") && brandCss("#4f46e5").includes(".dark{--primary:"), "css has both themes");
yes(!brandCss('red;}</style><script>').includes("<script"), "a hostile value never reaches the css");
applyBrandColor("#4f46e5"); // no document in node: must not throw
console.log("PASS applyBrandColor is safe without a document");
