/** The trip checklist: a private to-do and packing list on each trip. Pure functions, so the page, the dashboard card and the reminder agree. */

export const CHECKLIST_COLS = "id, trip_id, title, category, done, sort, created_at";
export const CHECKLIST_TABLE = "trip_checklist_items";
export const MAX_ITEMS = 200;

export const CATEGORIES = [
  { id: "documents", label: "Documents" },
  { id: "clothes", label: "Clothes" },
  { id: "tech", label: "Tech" },
  { id: "health", label: "Health" },
  { id: "other", label: "Other" },
] as const;
export type ChecklistCategory = (typeof CATEGORIES)[number]["id"];
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? "Other";
export const cleanCategory = (v: unknown): ChecklistCategory => (typeof v === "string" && CATEGORY_IDS.has(v) ? (v as ChecklistCategory) : "other");

export type ChecklistItem = { id: string; trip_id: string; title: string; category: ChecklistCategory; done: boolean; sort: number; created_at: string };

/** Capitals, accents, spaces and punctuation do not matter: "Panamá  City" is "panama city". */
export function normalizeText(s: unknown): string {
  return typeof s === "string" ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

/** The place a trip goes to: the city before any comma ("Panama City, Panama" and "panama city" are the same place). */
export function placeKey(destination: unknown): string {
  if (typeof destination !== "string") return "";
  return normalizeText(destination.split(/[,;(]/)[0]);
}

export function parseItem(input: { title?: unknown; category?: unknown }): { ok: true; title: string; category: ChecklistCategory } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (!title) return { ok: false, error: "Type what you need." };
  if (title.length > 120) return { ok: false, error: "That is too long. Use up to 120 characters." };
  return { ok: true, title, category: cleanCategory(input.category) };
}

/** Items in the order they are shown: by group, then the order they were added. */
export function groupItems<T extends { category: string; sort: number; created_at: string }>(items: T[]): { id: ChecklistCategory; label: string; items: T[] }[] {
  const out: { id: ChecklistCategory; label: string; items: T[] }[] = [];
  for (const c of CATEGORIES) {
    const mine = items.filter((i) => cleanCategory(i.category) === c.id).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
    if (mine.length) out.push({ id: c.id, label: c.label, items: mine });
  }
  return out;
}

export const progress = (items: { done: boolean }[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

/** The next things to do for the dashboard card: not ticked yet, in the order they were added. */
export const nextThings = <T extends { done: boolean; sort: number; created_at: string }>(items: T[], n = 3): T[] =>
  items.filter((i) => !i.done).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)).slice(0, n);

export type PastList = { tripId: string; name: string; destination: string; startDate: string | null; count: number };

/**
 * Earlier trips that have a list. `same` are the ones to the same place as this trip (newest first), `others` every other trip with a list.
 * The trip itself is never offered.
 */
export function pastLists(
  thisTrip: { id: string; destination: string | null },
  trips: { id: string; name: string; destination: string | null; start_date: string | null }[],
  counts: Record<string, number>,
): { same: PastList[]; others: PastList[] } {
  const here = placeKey(thisTrip.destination);
  const all = trips
    .filter((t) => t.id !== thisTrip.id && (counts[t.id] ?? 0) > 0)
    .map((t): PastList => ({ tripId: t.id, name: t.name, destination: t.destination ?? "", startDate: t.start_date, count: counts[t.id] }))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  const same = here ? all.filter((t) => placeKey(t.destination) === here) : [];
  const ids = new Set(same.map((t) => t.tripId));
  return { same, others: all.filter((t) => !ids.has(t.tripId)) };
}

/**
 * What to add when copying lists from other trips: nothing that is already on this list, nothing twice, always unticked.
 * `lists` are in the order the person chose; the first list's order is kept.
 */
export function copyItems(existing: { title: string }[], lists: { title: string; category: string }[][], startSort = 0): { title: string; category: ChecklistCategory; done: false; sort: number }[] {
  const seen = new Set(existing.map((e) => normalizeText(e.title)));
  const out: { title: string; category: ChecklistCategory; done: false; sort: number }[] = [];
  for (const list of lists) {
    for (const it of list) {
      const key = normalizeText(it.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ title: it.title.slice(0, 120), category: cleanCategory(it.category), done: false, sort: startSort + out.length });
    }
  }
  return out.slice(0, MAX_ITEMS);
}

/** Days before a trip starts that the reminder goes out (it stops once everything is ticked). */
export const REMINDER_DAYS = [2, 1] as const;

/** Should this trip get a reminder today? Only while something is unticked, and only on the reminder days. */
export function reminderDue(startDate: string, today: string, unticked: number): number | null {
  if (unticked < 1) return null;
  const days = Math.round((Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return (REMINDER_DAYS as readonly number[]).includes(days) ? days : null;
}

/** What the dashboard trip card shows: progress, the next things to do, and (for an empty list) a list from the same place to copy. */
export type CardChecklist = { total: number; done: number; next: { id: string; title: string }[]; suggestion: { place: string; count: number } | null };

export function cardChecklist(
  trip: { id: string; destination: string | null },
  trips: { id: string; name: string; destination: string | null; start_date: string | null }[],
  rows: { trip_id: string; id: string; title: string; done: boolean; sort: number; created_at: string }[],
): CardChecklist {
  const mine = rows.filter((r) => r.trip_id === trip.id);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.trip_id] = (counts[r.trip_id] ?? 0) + 1;
  const same = mine.length === 0 ? pastLists(trip, trips, counts).same[0] : undefined;
  const place = same ? (same.destination.split(/[,;(]/)[0].trim() || same.destination) : "";
  return {
    total: mine.length,
    done: mine.filter((r) => r.done).length,
    next: nextThings(mine).map((r) => ({ id: r.id, title: r.title })),
    suggestion: same ? { place, count: same.count } : null,
  };
}
