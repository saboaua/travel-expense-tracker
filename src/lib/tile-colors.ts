/** The colours a person can give the icon of a Personal page, and which pages can have one. Pure functions. */
export const TILE_COLORS = ["#db2777", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#4f46e5", "#7c3aed", "#475569"] as const;

/** One id per page: the last part of its address in the Personal list. */
export const TILE_IDS = ["budget", "fixed", "groceries", "shopping", "types", "prices", "spend", "fuel", "house", "savings", "utilities", "subscriptions", "projects", "travel"] as const;
export type TileId = (typeof TILE_IDS)[number];
export type TileColors = Partial<Record<TileId, string>>;

/** Pages whose default is not the standard colour of their feature. Other starts rose so it does not look like Shopping. */
export const DEFAULT_TILE_COLORS: TileColors = { types: "#db2777" };

/** Keep only known pages with an offered colour; anything else in the saved value is dropped. */
export function cleanTileColors(raw: unknown): TileColors {
  const out: TileColors = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of TILE_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && (TILE_COLORS as readonly string[]).includes(v.toLowerCase())) out[id] = v.toLowerCase();
  }
  return out;
}

/** The colour to show: the person's own, else the page's default (null means the feature's standard colour). */
export const tileColor = (colors: TileColors, id: TileId): string | null => colors[id] ?? DEFAULT_TILE_COLORS[id] ?? null;

/** A new set with one page's colour changed; null puts the default back. */
export function withTileColor(colors: TileColors, id: TileId, color: string | null): TileColors {
  const next = { ...colors };
  if (color && (TILE_COLORS as readonly string[]).includes(color.toLowerCase())) next[id] = color.toLowerCase(); else delete next[id];
  return next;
}
