import { findOverlap, planJoin, MATCH_WIDTH, type Gray } from "../src/lib/long-receipt";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

// A made-up receipt: dark blocks like words on lines, 240 wide.
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const W = MATCH_WIDTH, H = 1000;
const full = new Uint8Array(W * H).fill(235);
for (let line = 0; line < H / 9; line++) {
  let x = 8 + Math.floor(rnd() * 10);
  while (x < W - 20) {
    const len = 6 + Math.floor(rnd() * 30);
    for (let yy = 2; yy < 7; yy++) for (let xx = x; xx < Math.min(W - 8, x + len); xx++) full[(line * 9 + yy) * W + xx] = 30 + Math.floor(rnd() * 40);
    x += len + 5 + Math.floor(rnd() * 6);
  }
}
const slice = (from: number, to: number, shift = 0, noise = 0): Gray => {
  const data = new Uint8Array(W * (to - from));
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, full[from * W + i] + shift + (noise ? Math.floor((rnd() - 0.5) * noise) : 0)));
  return { w: W, h: to - from, data };
};

const a = slice(0, 450), b = slice(380, 800, -25, 10), c = slice(720, 1000);
const ab = findOverlap(a, b);
eq(ab && Math.abs(ab.rows - 70) <= 1, true, "two photos that share 70 rows are matched, even when the second is darker and noisy");
const bc = findOverlap(b, c);
console.log("scores", ab?.score, bc?.score);
eq(bc && Math.abs(bc.rows - 80) <= 1, true, "the second and third photos too");
eq(findOverlap(a, slice(600, 900)), null, "photos with nothing in common are not matched");
eq(findOverlap({ w: W, h: 300, data: new Uint8Array(W * 300).fill(240) }, { w: W, h: 300, data: new Uint8Array(W * 300).fill(240) }), null, "blank paper is never a match");
eq(findOverlap(a, { w: 100, h: 50, data: new Uint8Array(5000) }), null, "different widths cannot be compared");

const plan = planJoin([{ w: 3000, h: 4000 }, { w: 3000, h: 4000 }], [70]);
eq([plan.width, plan.parts[1].skip, plan.joins.length], [1000, Math.round(70 * 1000 / MATCH_WIDTH), 1], "joined at 1000 px wide, the repeated rows of the second photo are skipped");
eq(plan.height, plan.parts[0].scaledH + plan.parts[1].scaledH - plan.parts[1].skip, "the height is both photos minus the repeat");
const one = planJoin([{ w: 800, h: 1200 }, { w: 1200, h: 1600 }], [0]);
eq([one.width, one.parts[1].skip, one.height], [800, 0, 1200 + Math.round(1600 * 800 / 1200)], "photos of different widths are brought to the narrowest, and nothing is skipped when put one under the other");
const tall = planJoin(Array.from({ length: 6 }, () => ({ w: 3000, h: 6000 })), [0, 0, 0, 0, 0]);
eq(tall.height <= 6000 && tall.width < 1000, true, "a very long result is made smaller to stay within 6000 px");
eq(planJoin([{ w: 100, h: 100 }, { w: 100, h: 100 }], [999]).parts[1].skip <= 99, true, "never skips a whole part");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("long-receipt: all checks passed");
