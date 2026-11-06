// Run with: npx tsx tests/destination.test.ts
import { WIKI_THUMB_SIZE, WIKI_THUMB_STEPS } from "../src/lib/destination";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };
eq(WIKI_THUMB_STEPS.includes(WIKI_THUMB_SIZE), true, "destination photo width is one Wikimedia serves (an odd width such as 1400 is refused and the photo breaks)");
