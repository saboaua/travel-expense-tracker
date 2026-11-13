import { pieSlices, slices } from "../src/lib/personal/where-it-goes";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};
const by = { groceries: 482.4, utilities: 308.02, quick: 64.5, house: 90, savings: 150 };
const s = slices(by);
eq(s.map((x) => x.key), ["groceries", "utilities", "savings", "house", "quick"], "biggest first");
eq(s.map((x) => x.percent), [44, 28, 14, 8, 6], "whole percentages");
eq(s.reduce((t, x) => t + x.percent, 0), 100, "percentages add up to 100");
eq(slices({ groceries: 1, utilities: 1, quick: 1, house: 0, savings: 0 }).reduce((t, x) => t + x.percent, 0), 100, "thirds still add up to 100");
eq(slices({ groceries: 0, utilities: 0, quick: 0, house: 0, savings: 0 }), [], "nothing spent: no slices");
eq(slices({ ...by, quick: -5, house: 0, savings: 0, utilities: 0 }).map((x) => x.key), ["groceries"], "zero and negative parts are left out");
const p = pieSlices(s);
eq([p.length, p.filter((x) => x.label).map((x) => x.key)], [5, ["groceries", "utilities", "savings"]], "labels only on slices of 12% or more");
eq(p.every((x) => /^M[\d.\-,]+ A/.test(x.d)), true, "every slice has an arc path");
eq(pieSlices(slices({ ...by, utilities: 0, quick: 0, house: 0, savings: 0 }))[0].d.includes("Z M"), true, "a single part is a full ring");
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("where-it-goes: all checks passed");
