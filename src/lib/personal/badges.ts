/**
 * Community badges: a level for the prices a person has shared. One price per product and store counts, for life.
 * The levels here must match public._badge_level in supabase/migration_badges.sql. Pure, so it is unit-tested.
 */
export type Tier = { level: 1 | 2 | 3 | 4 | 5; name: string; from: number; dark: string; light: string; tint: string };

export const TIERS: Tier[] = [
  { level: 1, name: "Helper", from: 1, dark: "#b45309", light: "#f59e0b", tint: "#fff7ed" },
  { level: 2, name: "Scout", from: 150, dark: "#475569", light: "#94a3b8", tint: "#f1f5f9" },
  { level: 3, name: "Guardian", from: 750, dark: "#a16207", light: "#facc15", tint: "#fefce8" },
  { level: 4, name: "Champion", from: 2500, dark: "#047857", light: "#34d399", tint: "#ecfdf5" },
  { level: 5, name: "Legend", from: 4000, dark: "#1d4ed8", light: "#60a5fa", tint: "#eff6ff" },
];

/** 0 = no badge yet */
export function levelFor(total: number): number {
  let l = 0;
  for (const t of TIERS) if (total >= t.from) l = t.level;
  return l;
}
export const tierOf = (level: number): Tier | null => TIERS.find((t) => t.level === level) ?? null;

export type BadgeState = { total: number; level: number; best: number; seen: number };

/** Read what my_badge() returned; anything odd counts as no badge. */
export function readBadge(row: unknown): BadgeState {
  const r = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null | undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const total = n(r?.total);
  const best = Math.min(5, n(r?.best));
  return { total, level: Math.min(5, n(r?.level)), best: Math.max(best, levelFor(total)), seen: Math.min(5, n(r?.seen)) };
}

/** Where the person is on the way to the next level. next is null at the top. */
export function progress(total: number): { current: Tier | null; next: Tier | null; toGo: number; pct: number } {
  const lvl = levelFor(total);
  const current = tierOf(lvl);
  const next = tierOf(lvl + 1);
  if (!next) return { current, next: null, toGo: 0, pct: 100 };
  // the bar matches the words: "37 of 150"
  const pct = Math.max(0, Math.min(100, Math.round((total / next.from) * 100)));
  return { current, next, toGo: next.from - total, pct };
}

/** The level-up message is shown when a level was reached that the person has not seen yet. */
export const levelUpToShow = (b: BadgeState): number => (b.best > b.seen ? b.best : 0);
export const plural = (n: number) => `${n.toLocaleString("en-US")} price${n === 1 ? "" : "s"}`;
