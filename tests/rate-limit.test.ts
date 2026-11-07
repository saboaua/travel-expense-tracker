import { rateLimit, setRateLimitRpc } from "../src/lib/rate-limit";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (a !== b) { fail++; console.error(`FAIL ${m}: got ${a}, want ${b}`); } };

(async () => {
  // Database counter: shared across callers, allows up to max, then refuses
  const counts = new Map<string, number>();
  setRateLimitRpc(async (_fn, a) => {
    const k = String(a.p_key);
    counts.set(k, (counts.get(k) || 0) + 1);
    return { data: [{ count: counts.get(k), locked_until: null }], error: null };
  });
  const r: boolean[] = [];
  for (let i = 0; i < 4; i++) r.push(await rateLimit("ocr:u1", 3, 3600));
  eq("db: three allowed then refused", r.join(), "true,true,true,false");
  eq("db: another key is independent", await rateLimit("ocr:u2", 3, 3600), true);
  eq("db: key is namespaced", counts.has("rl:ocr:u1"), true);

  // Database error: falls back to memory and still limits
  const realError = console.error; console.error = () => {};
  setRateLimitRpc(async () => ({ data: null, error: { message: "down" } }));
  const m: boolean[] = [];
  for (let i = 0; i < 3; i++) m.push(await rateLimit("fx:u1", 2, 60, 1000));
  eq("memory fallback: two allowed then refused", m.join(), "true,true,false");
  eq("memory fallback: window expires", await rateLimit("fx:u1", 2, 60, 1000 + 61_000), true);

  // Database throws
  setRateLimitRpc(async () => { throw new Error("network"); });
  eq("throwing database still limits", [await rateLimit("x", 1, 60, 5), await rateLimit("x", 1, 60, 5)].join(), "true,false");

  // No database configured
  setRateLimitRpc(null);
  eq("no database: memory limit", [await rateLimit("y", 1, 60, 5), await rateLimit("y", 1, 60, 5)].join(), "true,false");
  console.error = realError;

  if (fail) process.exit(1);
  console.log("rate-limit checks passed");
})();
