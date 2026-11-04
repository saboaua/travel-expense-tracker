import { dhashFromGray, hammingHex, HASH_H, HASH_W } from "../src/lib/image-hash";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const n = HASH_W * HASH_H;
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const fakeReceipt = () => Array.from({ length: n }, () => Math.round(rnd() * 255));

eq("flat image gives all zero bits", dhashFromGray(new Array(n).fill(128)), "0000000000000000");
eq("brightness falling left to right gives all ones", dhashFromGray(Array.from({ length: n }, (_, i) => 255 - (i % HASH_W) * 20)), "ffffffffffffffff");
eq("hash is 16 hex characters", /^[0-9a-f]{16}$/.test(dhashFromGray(fakeReceipt())), true);
eq("identical hashes differ by 0 bits", hammingHex("ffff0000ffff0000", "ffff0000ffff0000"), 0);
eq("one flipped bit", hammingHex("0000000000000000", "0000000000000001"), 1);
eq("opposite hashes differ by 64 bits", hammingHex("0000000000000000", "ffffffffffffffff"), 64);
eq("a malformed hash never counts as a match", hammingHex("nope", "0000000000000000"), 64);

// The same receipt photographed twice (a little noise) stays close; different receipts are far apart.
const a = fakeReceipt();
const noisy = a.map((v) => Math.max(0, Math.min(255, v + Math.round((rnd() - 0.5) * 4))));
const sameDistance = hammingHex(dhashFromGray(a), dhashFromGray(noisy));
eq("same receipt with camera noise is within the match limit (2 bits)", sameDistance <= 2, true);
let nearMisses = 0;
for (let i = 0; i < 200; i++) if (hammingHex(dhashFromGray(a), dhashFromGray(fakeReceipt())) <= 2) nearMisses++;
eq("200 different receipts: none within the match limit", nearMisses, 0);
process.exit(fail ? 1 : 0);
