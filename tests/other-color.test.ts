import { OTHER_COLORS, DEFAULT_OTHER_COLOR, cleanOtherColor } from "../src/lib/use-other-color";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq(DEFAULT_OTHER_COLOR, "#db2777", "Other starts rose, not the orange Shopping uses");
eq((OTHER_COLORS as readonly string[]).includes("#ea580c") && (DEFAULT_OTHER_COLOR as string) !== "#ea580c", true, "orange is still offered but is not the default");
eq([cleanOtherColor(null), cleanOtherColor("red"), cleanOtherColor("#123456"), cleanOtherColor(undefined)], [DEFAULT_OTHER_COLOR, DEFAULT_OTHER_COLOR, DEFAULT_OTHER_COLOR, DEFAULT_OTHER_COLOR], "an empty or unknown value gives the default");
eq([cleanOtherColor("#2563EB"), cleanOtherColor("#7c3aed")], ["#2563eb", "#7c3aed"], "an offered colour is kept (any letter case)");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
