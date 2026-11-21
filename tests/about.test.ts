import { aboutInfo, updateState } from "../src/lib/about";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("release", aboutInfo("0.1.0", "36565d6a1b2c3d4e5f60718293a4b5c6d7e8f901", "2026-11-21T12:00:00.000Z"), { version: "0.1.0", build: "36565d6", updated: "Nov 21, 2026" });
eq("deployment id", aboutInfo("0.1.0", "dpl_abcdefghijklmnop", "2026-11-21T12:00:00.000Z").build, "dpl_abcdefgh");
eq("local run", aboutInfo("0.1.0", "local", undefined), { version: "0.1.0", build: "Development", updated: null });
eq("nothing known", aboutInfo(undefined, undefined, "garbage"), { version: "0.0.0", build: "Development", updated: null });

eq("same", updateState("abc", "abc"), "latest");
eq("different", updateState("abc", "def"), "behind");
eq("offline", updateState("abc", null), "unknown");
eq("local", updateState("local", "def"), "unknown");
eq("server unknown", updateState("abc", "unknown"), "unknown");

if (fail) process.exit(1);
console.log("about tests passed");
