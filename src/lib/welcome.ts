/** The welcome tour: who sees it, what it offers, and the Getting started checklist that follows it. */

export type TrackId = "business" | "spending" | "groceries" | "bills" | "savings";

export const TRACKS: { id: TrackId; label: string }[] = [
  { id: "business", label: "Business trips and reports" },
  { id: "spending", label: "Personal spending and budget" },
  { id: "groceries", label: "Groceries and prices" },
  { id: "bills", label: "Utility bills" },
  { id: "savings", label: "Savings goals" },
];

const TRACK_IDS = new Set<string>(TRACKS.map((t) => t.id));

/** Only known picks are kept (a stored list is never trusted as is). */
export function cleanTracks(v: unknown): TrackId[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is TrackId => typeof x === "string" && TRACK_IDS.has(x)))] : [];
}

/**
 * Shows the popup to someone who has not seen it. `seen` is undefined when the database has no welcome column yet
 * (the migration was not run): then nobody gets it. `forced` is the replay from Help (?tour=1).
 */
export function shouldShowWelcome(seen: string | null | undefined, forced: boolean): boolean {
  if (forced) return true;
  return seen === null;
}

export type Platform = "ios" | "android" | "other";

/** Which "add to home screen" steps to show first. iPadOS 13+ says it is a Mac, so touch support tells them apart. */
export function installPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

export const TOUR_STEPS = ["welcome", "highlights", "track", "home", "install"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

/** The three highlight slides. Each links to its Help guide. */
export const HIGHLIGHTS = [
  { id: "scan", help: "add-a-trip-receipt" },
  { id: "budget", help: "monthly-budget" },
  { id: "more", help: "bills-from-email" },
] as const;

export type ChecklistFacts = { homeSet: boolean; tracksSet: boolean; installed: boolean; hasReceipt: boolean; hasBudget: boolean; reminders: boolean };
export type ChecklistItem = { id: string; title: string; sub: string; done: boolean; cta?: string; href?: string };

export function checklist(f: ChecklistFacts): { items: ChecklistItem[]; done: number; all: boolean } {
  const items: ChecklistItem[] = [
    { id: "home", title: "Set your home place", sub: "Picks your currency", done: f.homeSet, cta: "Set", href: "/profile#home-place" },
    { id: "tracks", title: "Choose what to track", sub: "Spending, groceries, bills", done: f.tracksSet, cta: "Choose", href: "/?tour=1" },
    { id: "install", title: "Add to home screen", sub: "Opens like an app", done: f.installed, cta: "How", href: "/help/add-to-home-screen" },
    { id: "receipt", title: "Scan your first receipt", sub: "Takes about 20 seconds", done: f.hasReceipt, cta: "Scan", href: "/personal/groceries/new" },
    { id: "budget", title: "Set a monthly budget", sub: "See the bar fill as you spend", done: f.hasBudget, cta: "Set", href: "/personal/budget" },
    { id: "reminders", title: "Turn on reminders", sub: "Bill due dates and trip alerts", done: f.reminders, cta: "Turn on", href: "/profile#notifications" },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, all: done === items.length };
}
