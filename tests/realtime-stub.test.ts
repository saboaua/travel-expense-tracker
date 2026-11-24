// The browser build replaces @supabase/realtime-js with a small stand-in. This fails if the Supabase client starts calling
// something the stand-in does not have, or if the app starts using live subscriptions (then the stand-in must go).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { RealtimeClient } from "../src/lib/realtime-stub.js";

const used = new Set<string>();
for (const file of ["index.mjs"]) {
  const src = readFileSync(join("node_modules/@supabase/supabase-js/dist", file), "utf8");
  for (const m of src.matchAll(/\.realtime\.(\w+)/g)) used.add(m[1]);
}
assert.ok(used.size >= 4, "found the calls the Supabase client makes on its realtime client");
const client = new RealtimeClient() as unknown as Record<string, unknown>;
for (const name of used) assert.equal(typeof client[name], "function", `the stand-in must have ${name}()`);
assert.throws(() => (client.channel as (n: string) => void)("x"));

// The app itself must not subscribe to live changes
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
for (const f of walk("src")) {
  const text = readFileSync(f, "utf8");
  assert.ok(!/\.channel\(|\.on\(\s*["']postgres_changes/.test(text), `${f} uses realtime; remove the stand-in in next.config.mjs first`);
}
console.log("realtime stand-in ok");
