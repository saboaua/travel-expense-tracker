/** The company logos the admin keeps, and finding the one that fits a subscription's name. */
export type LibraryLogo = { id: string; name: string; keywords: string[]; logo: string };

/** Lower case, accents and punctuation gone, single spaces: "Spotify  Premium!" -> "spotify premium". */
export function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The library logo whose name or "also matches" words appear in the subscription name as whole words.
 * "Spotify Family" and "My Spotify" match Spotify; "Spotifyx" does not. The longest matching phrase wins, so
 * "Amazon Prime Video" picks the entry that names "prime video" before the one that only says "amazon".
 */
export function matchLogo(name: string, library: LibraryLogo[]): LibraryLogo | null {
  const hay = ` ${norm(name)} `;
  if (hay.trim() === "") return null;
  let best: { entry: LibraryLogo; len: number } | null = null;
  for (const entry of library) {
    for (const term of [entry.name, ...entry.keywords]) {
      const t = norm(term);
      if (t.length < 2) continue;
      if (hay.includes(` ${t} `) && (!best || t.length > best.len)) best = { entry, len: t.length };
    }
  }
  return best?.entry ?? null;
}

/** "disney plus, Disney Premium ,," -> ["disney plus", "Disney Premium"] (no empties, no repeats, at most 12). */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const k = part.trim().slice(0, 60);
    const key = norm(k);
    if (!k || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= 12) break;
  }
  return out;
}

/** A picture stored in a row: a small PNG, JPEG, WebP or SVG data address, within the database limit. */
export const MAX_LOGO_CHARS = 80_000;
export function isLogoData(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_LOGO_CHARS && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v);
}

/** The site to look up: "https://www.Spotify.com/en/x" -> "spotify.com". Null when it does not look like a website. */
export function cleanDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s || s.length > 200 || /\s/.test(s)) return null;
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/:\d+$/, "");
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(s) && s.length <= 100 ? s : null;
}

/** The size to draw a picture at so it fits a square of `size` px, keeping its shape: [width, height, x, y]. */
export function fitSquare(w: number, h: number, size: number): [number, number, number, number] {
  if (!(w > 0) || !(h > 0)) return [size, size, 0, 0];
  const k = Math.min(size / w, size / h);
  const dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
  return [dw, dh, Math.round((size - dw) / 2), Math.round((size - dh) / 2)];
}
