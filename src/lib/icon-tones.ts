import type { CSSProperties } from "react";

/**
 * One color per feature, used the same on every page: the bottom menu, the sidebar, tiles, rows and settings.
 * [light page, dark page]. Change a color here and it changes everywhere.
 * Red, green and amber also mean problem, good and warning in the app, so those meanings always come with a word or mark.
 */
export const ICON_TONES = {
  home: ["#1d4ed8", "#60a5fa"],
  groceries: ["#2563eb", "#60a5fa"],
  shopping: ["#c026d3", "#e879f9"],
  utilities: ["#d97706", "#fbbf24"],
  spend: ["#16a34a", "#4ade80"],
  house: ["#7c3aed", "#a78bfa"],
  savings: ["#0d9488", "#2dd4bf"],
  projects: ["#ea580c", "#fb923c"],
  subscriptions: ["#0891b2", "#22d3ee"],
  fixed: ["#475569", "#94a3b8"],
  loyalty: ["#e11d48", "#fb7185"],
  documents: ["#4f46e5", "#818cf8"],
  travel: ["#0284c7", "#38bdf8"],
  badges: ["#ca8a04", "#facc15"],
  notifications: ["#d97706", "#fbbf24"],
  place: ["#0d9488", "#2dd4bf"],
  sharing: ["#7c3aed", "#a78bfa"],
  invite: ["#c026d3", "#e879f9"],
  security: ["#dc2626", "#f87171"],
  data: ["#0369a1", "#38bdf8"],
  appearance: ["#6366f1", "#818cf8"],
  help: ["#1d4ed8", "#60a5fa"],
  admin: ["#475569", "#94a3b8"],
  people: ["#0284c7", "#38bdf8"],
  brand: ["#c026d3", "#e879f9"],
  support: ["#0891b2", "#22d3ee"],
  mail: ["#d97706", "#fbbf24"],
  money: ["#16a34a", "#4ade80"],
  telegram: ["#0284c7", "#38bdf8"],
  shop: ["#2563eb", "#60a5fa"],
  reports: ["#4f46e5", "#818cf8"],
  profile: ["#0284c7", "#38bdf8"],
  water: ["#0891b2", "#22d3ee"],
  electricity: ["#d97706", "#fbbf24"],
  phone: ["#4f46e5", "#818cf8"],
  internet: ["#0284c7", "#38bdf8"],
  septic: ["#92400e", "#d6a06b"],
  trash: ["#64748b", "#94a3b8"],
  otherBill: ["#475569", "#94a3b8"],
} as const satisfies Record<string, readonly [string, string]>;

export type IconTone = keyof typeof ICON_TONES;

/** Inline variables the `.tone` classes in globals.css read. */
export function toneStyle(tone: IconTone): CSSProperties {
  const [light, dark] = ICON_TONES[tone];
  return { "--tone": light, "--tone-dk": dark } as CSSProperties;
}
