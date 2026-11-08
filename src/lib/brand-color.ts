/**
 * One brand colour drives the whole interface. The admin picks a hex colour in Branding; these functions turn it into
 * the --primary / --ring tokens Tailwind reads (as "H S% L%"), tuned so white text on it passes contrast in light mode
 * and the colour stays readable on the dark surfaces.
 */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const DEFAULT_BRAND = "#2563eb";

function parseHex(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r, g, b].map((v) => v / 255);
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [((h * 60) + 360) % 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100, ln = l / 100, a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => { const k = (n + h / 30) % 12; return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/** WCAG relative luminance and contrast against white. */
export function contrastWithWhite([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05);
}

const fmt = (h: number, s: number, l: number) => `${Math.round(h * 10) / 10} ${Math.round(s * 10) / 10}% ${Math.round(l * 10) / 10}%`;

export type BrandTokens = { light: { primary: string; foreground: string; ring: string }; dark: { primary: string; foreground: string; ring: string } };

/** Tokens for a hex colour. An invalid colour falls back to the default blue. */
export function brandTokens(hex: string | null | undefined): BrandTokens {
  const rgb = parseHex(hex || "") ?? parseHex(DEFAULT_BRAND)!;
  const [h, s0, l0] = toHsl(rgb);
  const s = Math.min(s0, 90);
  // Light mode: darken until white text reaches 4.5:1 (AA)
  let l = Math.min(Math.max(l0, 28), 60);
  while (l > 20 && contrastWithWhite(hslToRgb(h, s, l)) < 4.5) l -= 1;
  // Dark mode: lighter so it shows on near-black, with dark text on top
  const ld = Math.max(l0, 62);
  return {
    light: { primary: fmt(h, s, l), foreground: "0 0% 100%", ring: fmt(h, s, l) },
    dark: { primary: fmt(h, s, ld), foreground: "222 47% 8%", ring: fmt(h, s, ld) },
  };
}

/** The CSS for the style tag in the page head (#brand-vars). */
export function brandCss(hex: string | null | undefined): string {
  const t = brandTokens(hex);
  return `:root{--primary:${t.light.primary};--primary-foreground:${t.light.foreground};--ring:${t.light.ring}}.dark{--primary:${t.dark.primary};--primary-foreground:${t.dark.foreground};--ring:${t.dark.ring}}`;
}

/** Applies a new brand colour to the open page (after saving in Branding, or when settings load). */
export function applyBrandColor(hex: string | null | undefined) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("brand-vars");
  if (!el) { el = document.createElement("style"); el.id = "brand-vars"; document.head.appendChild(el); }
  el.textContent = brandCss(hex);
}
