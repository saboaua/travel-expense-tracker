import { CATEGORIES, cardChecklist, cleanCategory, copyItems, groupItems, nextThings, normalizeText, parseItem, pastLists, placeKey, progress, reminderDue } from "../src/lib/trip-checklist";
import { normalizePushSettings } from "../src/lib/push-prefs";
import { pushMessage } from "../src/lib/push-text";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

// the same place, however it is typed
eq(placeKey("Panama City, Panama"), "panama city", "the city before the comma");
eq(placeKey("  PANAMÁ  city "), "panama city", "capitals, accents and spaces do not matter");
eq(placeKey(null), "", "no destination, no place");
eq(normalizeText("Charger & adapter!"), "charger adapter", "text is compared without punctuation");

// adding a thing
eq(parseItem({ title: "  Passport  ", category: "documents" }), { ok: true, title: "Passport", category: "documents" }, "a title is trimmed");
eq(parseItem({ title: "x", category: "nonsense" }), { ok: true, title: "x", category: "other" }, "an unknown group becomes Other");
eq(parseItem({ title: "   " }).ok, false, "an empty title is refused");
eq(parseItem({ title: "x".repeat(121) }).ok, false, "a long title is refused");
eq(cleanCategory("tech"), "tech", "a known group is kept");

// order and progress
const rows = [
  { id: "a", trip_id: "t", title: "Shirt", category: "clothes", done: true, sort: 2, created_at: "2026-01-02" },
  { id: "b", trip_id: "t", title: "Passport", category: "documents", done: false, sort: 1, created_at: "2026-01-01" },
  { id: "c", trip_id: "t", title: "Jacket", category: "clothes", done: false, sort: 3, created_at: "2026-01-03" },
];
eq(groupItems(rows).map((g) => [g.id, g.items.map((i) => i.id)]), [["documents", ["b"]], ["clothes", ["a", "c"]]], "groups in a fixed order, things in the order added");
eq(progress(rows), { done: 1, total: 3 }, "progress counts the ticked");
eq(nextThings(rows).map((r) => r.id), ["b", "c"], "next things are the unticked ones, in order");
eq(CATEGORIES.map((c) => c.id), ["documents", "clothes", "tech", "health", "other"], "the five groups");

// copying from other trips
const trips = [
  { id: "now", name: "Now", destination: "Panama City", start_date: "2026-11-17" },
  { id: "old1", name: "Winlott 2025", destination: "panama city, Panama", start_date: "2025-11-10" },
  { id: "old2", name: "Copa 2024", destination: "Panamá City", start_date: "2024-03-01" },
  { id: "far", name: "Miami", destination: "Miami", start_date: "2025-06-01" },
  { id: "empty", name: "No list", destination: "Panama City", start_date: "2023-01-01" },
];
const counts = { old1: 14, old2: 9, far: 5, now: 2 };
const pl = pastLists({ id: "now", destination: "Panama City" }, trips, counts);
eq(pl.same.map((l) => l.tripId), ["old1", "old2"], "same place, newest first, never this trip, never an empty list");
eq(pl.others.map((l) => l.tripId), ["far"], "other trips with a list can be picked by hand");
eq(pastLists({ id: "now", destination: null }, trips, counts).same, [], "no destination, no suggestion");
const added = copyItems([{ title: "Passport" }], [[{ title: "passport", category: "documents" }, { title: "Charger", category: "tech" }], [{ title: "CHARGER!", category: "tech" }, { title: "Rain jacket", category: "weird" }]], 5);
eq(added.map((a) => [a.title, a.category, a.done, a.sort]), [["Charger", "tech", false, 5], ["Rain jacket", "other", false, 6]], "nothing twice, nothing already there, always unticked");

// the dashboard card
const items = [
  { trip_id: "old1", id: "1", title: "Passport", done: true, sort: 1, created_at: "2025-01-01" },
  { trip_id: "old1", id: "2", title: "Charger", done: false, sort: 2, created_at: "2025-01-02" },
];
eq(cardChecklist({ id: "now", destination: "Panama City" }, trips, items), { total: 0, done: 0, next: [], suggestion: { place: "panama city", count: 2 } }, "an empty list offers the one from the same place");
eq(cardChecklist({ id: "old1", destination: "Panama City" }, trips, items), { total: 2, done: 1, next: [{ id: "2", title: "Charger" }], suggestion: null }, "a list shows progress and what is next");

// reminders: 2 days and 1 day before, only while something is unticked
eq([reminderDue("2026-11-20", "2026-11-18", 3), reminderDue("2026-11-20", "2026-11-19", 3)], [2, 1], "two days and one day before");
eq([reminderDue("2026-11-20", "2026-11-17", 3), reminderDue("2026-11-20", "2026-11-20", 3), reminderDue("2026-11-20", "2026-11-18", 0)], [null, null, null], "not earlier, not on the day, not when all is ticked");

// the switch and the wording
eq(normalizePushSettings(null).checklist, true, "the checklist alert is on until switched off");
eq(normalizePushSettings({ checklist: false }).checklist, false, "and can be switched off");
const msg = (d: object, detail: "details" | "private" = "details") => pushMessage("checklist", d, detail).body;
eq(msg({ trip: "Winlott Meeting", count: 6, days: 1 }), "Winlott Meeting: 6 things not ticked yet. You leave tomorrow. Open your checklist to finish.", "the alert says how many are left");
eq(msg({ trip: "Winlott Meeting", count: 1, days: 2 }), "Winlott Meeting: 1 thing not ticked yet. You leave in 2 days. Open your checklist to finish.", "one thing, two days");
eq(msg({ trip: "Winlott Meeting", count: 6, days: 1 }, "private"), "Your trip checklist still has things to tick. Open the app to finish it.", "private style names nothing");
eq(msg({}), "Your trip checklist still has things to tick. Open the app to finish it.", "no facts, generic wording");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
