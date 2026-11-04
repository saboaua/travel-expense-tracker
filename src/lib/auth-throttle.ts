/**
 * Sign-in throttling.
 *
 * Counters are kept per sign-in window in their own small table (public.auth_throttle) and updated atomically,
 * instead of counting rows in the security log. Three keys are tracked:
 *   ip     - failures from one address (any email)              -> locked 15 min after 10
 *   pair   - failures from one address for one email            -> locked 15 min after 5
 *   email  - failures for one email from anywhere               -> CAPTCHA required from 5 (or, without a
 *            CAPTCHA configured, a lock after 30)
 * Because the lock for one email is tied to the address that failed, someone else cannot lock the real owner out
 * from another address. If the database is unreachable the limits keep working from memory (per server instance)
 * and the admin is told that protection is degraded.
 */
export const POLICY = {
  windowSec: 15 * 60,
  lockSec: 15 * 60,
  ipLimit: 10,
  pairLimit: 5,
  captchaAt: 5,
  emailHardLimit: 30,
} as const;

export type Entry = { count: number; lockedUntil: number | null }; // lockedUntil: epoch ms
export interface ThrottleStore {
  status(keys: string[]): Promise<Record<string, Entry>>;
  hit(key: string, limit: number, lockSec: number): Promise<Entry>;
  reset(key: string): Promise<void>;
}

type Keys = { ip?: string; pair: string; email: string };

/** An unknown address (no proxy header) is shared by everyone, so it gets no per-address counter. */
export function keysFor(ip: string | null | undefined, email: string): Keys {
  const known = ip && ip !== "unknown" ? ip : null;
  return {
    ...(known ? { ip: `ip:${known}` } : {}),
    pair: `pair:${known ?? "?"}|${email}`,
    email: `email:${email}`,
  };
}

type Decision =
  | { action: "allow" }
  | { action: "block"; scope: "ip" | "pair" | "email"; retryAfterSec: number }
  | { action: "captcha" };

export function decide(
  status: Record<string, Entry>,
  keys: Keys,
  opts: { captchaConfigured: boolean; captchaPassed: boolean; now?: number }
): Decision {
  const now = opts.now ?? Date.now();
  const locked = (k?: string) => (k && status[k]?.lockedUntil && status[k].lockedUntil! > now ? status[k].lockedUntil! : null);
  const retry = (until: number) => Math.max(1, Math.ceil((until - now) / 1000));

  const ipLock = locked(keys.ip);
  if (ipLock) return { action: "block", scope: "ip", retryAfterSec: retry(ipLock) };
  const pairLock = locked(keys.pair);
  if (pairLock) return { action: "block", scope: "pair", retryAfterSec: retry(pairLock) };

  if (opts.captchaConfigured) {
    if ((status[keys.email]?.count ?? 0) >= POLICY.captchaAt && !opts.captchaPassed) return { action: "captcha" };
  } else {
    const emailLock = locked(keys.email);
    if (emailLock) return { action: "block", scope: "email", retryAfterSec: retry(emailLock) };
  }
  return { action: "allow" };
}

/** Counts a failed password. Returns whether the next attempt for this email will need a CAPTCHA. */
export async function recordFailure(store: ThrottleStore, keys: Keys, captchaConfigured: boolean): Promise<{ captchaNext: boolean }> {
  const [, , email] = await Promise.all([
    keys.ip ? store.hit(keys.ip, POLICY.ipLimit, POLICY.lockSec) : Promise.resolve(null),
    store.hit(keys.pair, POLICY.pairLimit, POLICY.lockSec),
    // With a CAPTCHA the per-email counter only raises the challenge; without one it must lock.
    store.hit(keys.email, captchaConfigured ? Number.MAX_SAFE_INTEGER : POLICY.emailHardLimit, captchaConfigured ? 0 : POLICY.lockSec),
  ]);
  return { captchaNext: captchaConfigured && (email?.count ?? 0) >= POLICY.captchaAt };
}

/** A good password clears this person's counters (not the address-wide one, so a shared address cannot be reset by one login). */
export async function recordSuccess(store: ThrottleStore, keys: Keys): Promise<void> {
  await Promise.all([store.reset(keys.pair), store.reset(keys.email)]);
}

/* ---------------- stores ---------------- */

/** In-process store: used in tests and as the fallback when the database is not reachable. */
export class MemoryStore implements ThrottleStore {
  private m = new Map<string, { count: number; start: number; lockedUntil: number | null }>();
  constructor(private now: () => number = Date.now, private windowMs = POLICY.windowSec * 1000) {}

  private live(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.start + this.windowMs <= this.now()) {
      this.m.delete(key);
      return null;
    }
    return e;
  }
  async status(keys: string[]) {
    const out: Record<string, Entry> = {};
    for (const k of keys) {
      const e = this.live(k);
      out[k] = { count: e?.count ?? 0, lockedUntil: e?.lockedUntil && e.lockedUntil > this.now() ? e.lockedUntil : null };
    }
    return out;
  }
  async hit(key: string, limit: number, lockSec: number) {
    const e = this.live(key) ?? { count: 0, start: this.now(), lockedUntil: null };
    e.count += 1;
    if (lockSec > 0 && e.count >= limit && (!e.lockedUntil || e.lockedUntil <= this.now())) e.lockedUntil = this.now() + lockSec * 1000;
    this.m.set(key, e);
    if (this.m.size > 20000) this.m.clear(); // never grow without bound
    return { count: e.count, lockedUntil: e.lockedUntil };
  }
  async reset(key: string) {
    this.m.delete(key);
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Database store (Supabase functions from migration_throttle_retention.sql, service role only). */
export class SupabaseStore implements ThrottleStore {
  constructor(private rpc: Rpc) {}
  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  async status(keys: string[]) {
    const rows = await this.call<{ key: string; count: number; locked_until: string | null }[]>("throttle_status", { p_keys: keys, p_window_seconds: POLICY.windowSec });
    const out: Record<string, Entry> = {};
    for (const k of keys) out[k] = { count: 0, lockedUntil: null };
    for (const r of rows || []) out[r.key] = { count: Number(r.count), lockedUntil: r.locked_until ? Date.parse(r.locked_until) : null };
    return out;
  }
  async hit(key: string, limit: number, lockSec: number) {
    const rows = await this.call<{ count: number; locked_until: string | null }[]>("throttle_hit", {
      p_key: key,
      p_window_seconds: POLICY.windowSec,
      p_limit: Math.min(limit, 2_000_000_000),
      p_lock_seconds: lockSec,
    });
    const r = rows?.[0];
    return { count: Number(r?.count ?? 0), lockedUntil: r?.locked_until ? Date.parse(r.locked_until) : null };
  }
  async reset(key: string) {
    await this.call("throttle_reset", { p_key: key });
  }
}

/** Uses the primary store; if it fails the request is served from memory and `onDegraded` is told why. */
export class ResilientStore implements ThrottleStore {
  constructor(private primary: ThrottleStore | null, private fallback: ThrottleStore, private onDegraded: (reason: string) => void) {}
  private async run<T>(op: (s: ThrottleStore) => Promise<T>): Promise<T> {
    if (this.primary) {
      try {
        return await op(this.primary);
      } catch (e) {
        this.onDegraded(e instanceof Error ? e.message : "unknown error");
      }
    } else {
      this.onDegraded("no database connection configured");
    }
    return op(this.fallback);
  }
  status(keys: string[]) {
    return this.run((s) => s.status(keys));
  }
  hit(key: string, limit: number, lockSec: number) {
    return this.run((s) => s.hit(key, limit, lockSec));
  }
  reset(key: string) {
    return this.run((s) => s.reset(key));
  }
}
