import { randomCode } from "../src/lib/telegram";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n); };
const c = randomCode(32);
eq("length", c.length, 32);
eq("alphabet", /^[A-HJ-NP-Z2-9]+$/.test(c), true);
eq("default length 6", randomCode().length, 6);
const seen = new Set(Array.from({ length: 2000 }, () => randomCode(8)));
eq("no collisions in 2000 draws", seen.size, 2000);
// every character of the alphabet shows up (rough uniformity check)
const all = Array.from({ length: 4000 }, () => randomCode(8)).join("");
eq("all 32 symbols used", new Set(all).size, 32);
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
