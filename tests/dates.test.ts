import { dayStartInstant, dayEndInstant } from "../src/lib/utils";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { addDaysISO, todayISO } from "../src/lib/utils";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

// 9:30 pm on Nov 4 in Aruba (UTC-4) is already Nov 5 in UTC: "today" must still be Nov 4
const evening = new Date("2026-11-05T01:30:00Z");
eq("evening in Aruba is still the same day", todayISO("America/Aruba", evening), "2026-11-04");
eq("the UTC date would have been tomorrow (the old bug)", evening.toISOString().slice(0, 10), "2026-11-05");
eq("morning in Aruba", todayISO("America/Aruba", new Date("2026-11-04T09:00:00Z")), "2026-11-04");
eq("just after local midnight", todayISO("America/Aruba", new Date("2026-11-04T04:05:00Z")), "2026-11-04");
eq("just before local midnight", todayISO("America/Aruba", new Date("2026-11-04T03:55:00Z")), "2026-11-03");

eq("addDaysISO back a week", addDaysISO("2026-11-04", -7), "2026-10-28");
eq("addDaysISO across month and year", addDaysISO("2026-01-02", -3), "2025-12-30");
eq("addDaysISO leap day", addDaysISO("2028-02-28", 1), "2028-02-29");

// Guard: no code may take "today" from the UTC clock. (Parsing/validating a given date is fine and not matched.)
const bad: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && /new Date\(\)\.toISOString\(\)\.(slice|split)/.test(readFileSync(p, "utf8"))) bad.push(p);
  }
};
walk("src");
eq("no source file builds today's date from the UTC clock", bad, []);

// a calendar day in Aruba (UTC-4) as exact instants: the last hour of the Aruba evening is already the next UTC day
eq("Aruba day starts at 04:00 UTC", dayStartInstant("2026-11-05"), "2026-11-05T04:00:00.000Z");
eq("Aruba day ends at 03:59:59.999 UTC next day", dayEndInstant("2026-11-05"), "2026-11-06T03:59:59.999Z");

console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);

