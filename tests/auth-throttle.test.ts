import { POLICY, MemoryStore, ResilientStore, SupabaseStore, decide, keysFor, recordFailure, recordSuccess, type ThrottleStore } from "../src/lib/auth-throttle";
import { clampDetails, createLogLimiter } from "../src/lib/log-limit";
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

(async () => {
  let t = 1_000_000_000_000;
  const now = () => t;
  const E = "owner@example.com";
  const check = async (store: ThrottleStore, ip: string, email = E, o: { captcha?: boolean; passed?: boolean } = {}) => {
    const k = keysFor(ip, email);
    const status = await store.status([k.ip, k.pair, k.email].filter(Boolean) as string[]);
    return { k, d: decide(status, k, { captchaConfigured: !!o.captcha, captchaPassed: !!o.passed, now: now() }) };
  };
  const fails = async (store: ThrottleStore, ip: string, n: number, email = E, captcha = false) => { for (let i = 0; i < n; i++) await recordFailure(store, keysFor(ip, email), captcha); };

  // --- no captcha configured
  let s = new MemoryStore(now);
  await fails(s, "1.1.1.1", 4);
  eq("4 failures: still allowed", (await check(s, "1.1.1.1")).d.action, "allow");
  await fails(s, "1.1.1.1", 1);
  const blocked = (await check(s, "1.1.1.1")).d;
  eq("5th failure locks that address+email pair", [blocked.action, (blocked as { scope?: string }).scope], ["block", "pair"]);
  eq("retry time is 15 minutes", (blocked as { retryAfterSec: number }).retryAfterSec, 900);
  eq("the real owner on another address is NOT locked out", (await check(s, "9.9.9.9")).d.action, "allow");
  eq("same address, different email still allowed", (await check(s, "1.1.1.1", "other@example.com")).d.action, "allow");

  // --- per-address limit across many emails
  s = new MemoryStore(now);
  for (let i = 0; i < POLICY.ipLimit; i++) await recordFailure(s, keysFor("2.2.2.2", `u${i}@x.com`), false);
  const ipBlock = (await check(s, "2.2.2.2", "fresh@x.com")).d;
  eq("10 failures from one address (spraying many emails) locks the address", [ipBlock.action, (ipBlock as { scope?: string }).scope], ["block", "ip"]);
  eq("other addresses unaffected", (await check(s, "3.3.3.3", "fresh@x.com")).d.action, "allow");

  // --- distributed attack on one email, no captcha: hard lock after 30
  s = new MemoryStore(now);
  for (let i = 0; i < POLICY.emailHardLimit; i++) await recordFailure(s, keysFor(`5.5.${Math.floor(i / 200)}.${i % 200}`, E), false);
  const emailBlock = (await check(s, "7.7.7.7")).d;
  eq("30 failures from many addresses locks the email (no captcha available)", [emailBlock.action, (emailBlock as { scope?: string }).scope], ["block", "email"]);

  // --- with captcha: challenge instead of lock
  s = new MemoryStore(now);
  for (let i = 0; i < POLICY.captchaAt; i++) await recordFailure(s, keysFor(`6.6.6.${i}`, E), true);
  eq("captcha required once 5 failures hit the email", (await check(s, "7.7.7.7", E, { captcha: true })).d.action, "captcha");
  eq("passing the captcha allows the attempt", (await check(s, "7.7.7.7", E, { captcha: true, passed: true })).d.action, "allow");
  for (let i = 0; i < 100; i++) await recordFailure(s, keysFor(`8.8.${Math.floor(i / 200)}.${i % 200}`, E), true);
  eq("with captcha the email is never hard-locked", (await check(s, "7.7.7.7", E, { captcha: true, passed: true })).d.action, "allow");
  const r = await recordFailure(new MemoryStore(now), keysFor("4.4.4.4", E), true);
  eq("first failure does not ask for captcha", r.captchaNext, false);

  // --- success clears the person's counters
  s = new MemoryStore(now);
  await fails(s, "1.1.1.1", 5);
  await recordSuccess(s, keysFor("1.1.1.1", E));
  eq("success clears the lock for that pair", (await check(s, "1.1.1.1")).d.action, "allow");

  // --- window expiry
  s = new MemoryStore(now);
  await fails(s, "1.1.1.1", 5);
  t += (POLICY.windowSec + 1) * 1000;
  eq("lock and counters expire after the window", (await check(s, "1.1.1.1")).d.action, "allow");
  t += 0;

  // --- unknown address
  const k = keysFor("unknown", E);
  eq("unknown address gets no per-address key", k.ip, undefined);

  // --- resilient store: database down -> falls back and reports
  const reasons: string[] = [];
  const broken: ThrottleStore = { status: async () => { throw new Error("relation \"auth_throttle\" does not exist"); }, hit: async () => { throw new Error("down"); }, reset: async () => { throw new Error("down"); } };
  const res = new ResilientStore(broken, new MemoryStore(now), (m) => reasons.push(m));
  await fails(res, "1.1.1.1", 5);
  eq("fallback still enforces the limit when the database is down", (await check(res, "1.1.1.1")).d.action, "block");
  eq("degraded reason reported", reasons.length > 0 && /does not exist|down/.test(reasons.join()), true);
  const noDb = new ResilientStore(null, new MemoryStore(now), (m) => reasons.push(m));
  eq("no database configured still works from memory", (await check(noDb, "1.1.1.1")).d.action, "allow");

  // --- supabase store maps rows
  const calls: string[] = [];
  const rpc = async (fn: string) => {
    calls.push(fn);
    if (fn === "throttle_status") return { data: [{ key: "pair:a|b", count: 3, locked_until: new Date(t + 60_000).toISOString() }], error: null };
    if (fn === "throttle_hit") return { data: [{ count: 2, locked_until: null }], error: null };
    return { data: null, error: null };
  };
  const sb = new SupabaseStore(rpc);
  const st = await sb.status(["pair:a|b", "ip:1"]);
  eq("supabase status maps rows and defaults", [st["pair:a|b"].count, st["pair:a|b"].lockedUntil, st["ip:1"]], [3, t + 60_000, { count: 0, lockedUntil: null }]);
  eq("supabase hit maps row", (await sb.hit("k", 5, 900)).count, 2);
  await sb.reset("k");
  eq("rpc names", calls, ["throttle_status", "throttle_hit", "throttle_reset"]);
  const errStore = new SupabaseStore(async () => ({ data: null, error: { message: "function public.throttle_hit does not exist" } }));
  let threw = false; try { await errStore.hit("k", 1, 1); } catch { threw = true; }
  eq("supabase error is thrown (so the resilient store can fall back)", threw, true);

  // --- log limiter
  t = 5_000_000;
  const allow = createLogLimiter({ perKey: 3, perType: 10, windowMs: 60_000, now });
  const results = Array.from({ length: 6 }, () => allow("1.1.1.1", "suspicious_input").write);
  eq("one noisy address: first 3 written, rest dropped", results, [true, true, true, false, false, false]);
  eq("another address unaffected", allow("2.2.2.2", "suspicious_input").write, true);
  t += 61_000;
  const again = allow("1.1.1.1", "suspicious_input");
  eq("after the window it writes again and reports how many were dropped", [again.write, again.suppressed], [true, 3]);
  const flood = createLogLimiter({ perKey: 100, perType: 5, windowMs: 60_000, now });
  const spread = Array.from({ length: 8 }, (_, i) => flood(`9.9.9.${i}`, "csp_violation").write);
  eq("many addresses are capped per event type", spread.filter(Boolean).length, 5);
  eq("small details kept", clampDetails({ a: 1 }), { a: 1 });
  eq("huge details truncated", (clampDetails({ x: "a".repeat(10000) }) as { truncated?: boolean }).truncated, true);
  eq("undefined details", clampDetails(undefined), {});

  console.log(fail ? `${fail} FAILED` : "ALL PASSED");
  process.exit(fail ? 1 : 0);
})();
