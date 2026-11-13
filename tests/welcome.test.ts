import { checklist, cleanTracks, installPlatform, shouldShowWelcome, TRACKS } from "../src/lib/welcome";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq([shouldShowWelcome(null, false), shouldShowWelcome("2026-11-13T10:00:00Z", false), shouldShowWelcome(undefined, false)], [true, false, false], "new people see it; people who saw it, and a database without the column, do not");
eq([shouldShowWelcome("2026-11-13T10:00:00Z", true), shouldShowWelcome(undefined, true)], [true, true], "the replay from Help always opens it");

eq(cleanTracks(["spending", "bogus", "spending", 3, "bills"]), ["spending", "bills"], "unknown or repeated picks are dropped");
eq([cleanTracks(null), cleanTracks("spending")], [[], []], "a stored value that is not a list gives none");
eq(TRACKS.length, 5, "five things to track");

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
eq([installPlatform(iphone), installPlatform(pixel), installPlatform(mac, 0), installPlatform(mac, 5), installPlatform("")], ["ios", "android", "other", "ios", "other"], "the home-screen steps follow the device (an iPad that says Mac included)");

const none = checklist({ homeSet: false, tracksSet: false, installed: false, hasReceipt: false, hasBudget: false, reminders: false });
eq([none.done, none.all, none.items.length], [0, false, 6], "nothing done yet");
const some = checklist({ homeSet: true, tracksSet: true, installed: false, hasReceipt: true, hasBudget: false, reminders: false });
eq([some.done, some.items.filter((i) => i.done).map((i) => i.id)], [3, ["home", "tracks", "receipt"]], "done items are counted");
eq(checklist({ homeSet: true, tracksSet: true, installed: true, hasReceipt: true, hasBudget: true, reminders: true }).all, true, "all done");
eq(none.items.every((i) => !!i.href && !!i.cta), true, "every open item says what to tap and where it goes");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
