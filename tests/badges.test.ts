import { TIERS, levelFor, progress, readBadge, levelUpToShow, tierOf } from "../src/lib/personal/badges";
import { pushMessage } from "../src/lib/push-text";
import { DEFAULT_PUSH_SETTINGS } from "../src/lib/push-prefs";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

// the cut-offs (must match public._badge_level in migration_badges.sql)
eq("levels", [0, 1, 149, 150, 749, 750, 2499, 2500, 3999, 4000, 9000].map(levelFor), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
eq("names", TIERS.map((t) => t.name), ["Helper", "Scout", "Guardian", "Champion", "Legend"]);
eq("tierOf", [tierOf(0), tierOf(2)?.name, tierOf(6)], [null, "Scout", null]);

// the way to the next level
eq("no badge yet", progress(0).next?.name, "Helper");
eq("37 of 150", [progress(37).current?.name, progress(37).next?.name, progress(37).toGo, progress(37).pct], ["Helper", "Scout", 113, 25]);
eq("top", [progress(5000).next, progress(5000).toGo, progress(5000).pct], [null, 0, 100]);
eq("exactly at a level", [progress(150).current?.name, progress(150).pct], ["Scout", 20]);

// reading the database answer
eq("reads a row", readBadge([{ total: 150, level: 2, best: 2, seen: 1 }]), { total: 150, level: 2, best: 2, seen: 1 });
eq("bad answer is no badge", readBadge(null), { total: 0, level: 0, best: 0, seen: 0 });
eq("best never below the level", readBadge({ total: 160, level: 2, best: 0, seen: 0 }).best, 2);
eq("level-up shows once", [levelUpToShow({ total: 150, level: 2, best: 2, seen: 1 }), levelUpToShow({ total: 150, level: 2, best: 2, seen: 2 })], [2, 0]);
eq("after delete the earned badge stays", [levelUpToShow({ total: 0, level: 0, best: 2, seen: 2 }), readBadge({ total: 0, level: 0, best: 2, seen: 2 }).best], [0, 2]);

// the phone alert
const msg = (item: string, count: number, detail: "details" | "private") => pushMessage("badge", { item, count }, detail).body;
eq("alert", msg("Scout", 150, "details"), "New badge: Scout. You have shared 150 prices. Thank you.");
eq("alert one price", msg("Helper", 1, "details"), "New badge: Helper. You have shared 1 price. Thank you.");
eq("alert private", msg("Scout", 150, "private"), "You earned a new badge.");
eq("alert without a name", pushMessage("badge", {}, "details").body, "You earned a new badge.");
eq("on by default", (DEFAULT_PUSH_SETTINGS as unknown as Record<string, boolean>).badges, true);

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("badges ok");
