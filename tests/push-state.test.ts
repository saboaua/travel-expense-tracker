import { pushState } from "../src/lib/push-state";
import { DEFAULT_PUSH_SETTINGS, normalizePushSettings, parsePushPatch } from "../src/lib/push-prefs";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const base = { support: "ok" as const, permission: "granted" as const, hasSub: true, registered: true, wanted: true };

eq(pushState(base), "on", "phone and server agree: on");
eq(pushState({ ...base, registered: false }), "repair", "server lost the device: repair");
eq(pushState({ ...base, hasSub: false, registered: false }), "restore", "new install or reset phone after wanting alerts: restore");
eq(pushState({ ...base, permission: "default", hasSub: false, registered: false }), "restore", "permission cleared: restore");
eq(pushState({ ...base, permission: "default", hasSub: false, registered: false, wanted: false }), "off", "never wanted: off, nothing is offered");
eq(pushState({ ...base, permission: "denied", hasSub: false, registered: false }), "blocked", "blocked in phone settings after wanting");
eq(pushState({ ...base, permission: "denied", hasSub: false, registered: false, wanted: false }), "off", "denied and never wanted: off");
eq(pushState({ ...base, support: "needs-install" }), "needs-install", "iPhone outside the Home Screen app");
eq(pushState({ ...base, support: "unsupported" }), "unsupported", "no push in this browser");
eq(pushState({ ...base, wanted: false }), "on", "a device already on stays on even before the wish was recorded");

eq(DEFAULT_PUSH_SETTINGS.wanted, false, "wanted starts off");
eq(normalizePushSettings({ wanted: true }).wanted, true, "wanted is kept");
eq(normalizePushSettings({ wanted: "yes" }).wanted, false, "a wrong type is ignored");
eq(normalizePushSettings({ trips: false }).wanted, false, "older saved settings have no wish");
eq(parsePushPatch({ wanted: true })?.wanted, true, "wanted can be saved");
eq(parsePushPatch({ wanted: "x" }), null, "wanted must be true or false");

if (failed) { console.error(`${failed} failed`); process.exit(1); }
