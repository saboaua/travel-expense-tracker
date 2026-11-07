import { createClient } from "@supabase/supabase-js";

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const memory = new Map<string, { n: number; reset: number }>();

/** Fixed-window count kept in this server instance only (used when the database cannot be reached). */
function memoryHit(key: string, windowSec: number, now: number): number {
  const e = memory.get(key);
  if (!e || e.reset <= now) {
    memory.set(key, { n: 1, reset: now + windowSec * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
    return 1;
  }
  return ++e.n;
}

let rpcOverride: Rpc | null | undefined;
/** For tests: replace the database call (null = no database). */
export function setRateLimitRpc(rpc: Rpc | null | undefined) {
  rpcOverride = rpc;
  memory.clear();
}

function defaultRpc(): Rpc | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return (fn, args) => db.rpc(fn, args);
}

/**
 * True while `key` has made at most `max` calls in the last `windowSec` seconds.
 * The count lives in the database (same counters table as the sign-in limits, atomic across all server instances),
 * so it cannot be dodged by being routed to a different instance. If the database cannot be reached the limit
 * keeps working from memory, per instance, rather than switching off.
 */
export async function rateLimit(key: string, max: number, windowSec: number, now = Date.now()): Promise<boolean> {
  const rpc = rpcOverride === undefined ? defaultRpc() : rpcOverride;
  if (rpc) {
    try {
      const { data, error } = await rpc("throttle_hit", { p_key: `rl:${key}`, p_window_seconds: windowSec, p_limit: 2_000_000_000, p_lock_seconds: 0 });
      if (error) throw new Error(error.message);
      const count = Number((data as { count: number }[] | null)?.[0]?.count);
      if (Number.isFinite(count)) return count <= max;
    } catch (e) {
      console.error("[rate-limit] database unavailable, using memory:", e instanceof Error ? e.message : e);
    }
  }
  return memoryHit(`rl:${key}`, windowSec, now) <= max;
}
