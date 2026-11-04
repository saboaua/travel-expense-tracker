/**
 * Caps how fast attacker-controllable events can be written to the security log, so one noisy address
 * cannot fill the table. Per server instance (cheap, no database call); the retention job bounds the rest.
 */
type LimiterOptions = { perKey?: number; perType?: number; windowMs?: number; now?: () => number };

export function createLogLimiter({ perKey = 20, perType = 200, windowMs = 60_000, now = Date.now }: LimiterOptions = {}) {
  const keys = new Map<string, { n: number; reset: number; dropped: number }>();
  const types = new Map<string, { n: number; reset: number }>();

  /** Returns whether to write the event, and how many were dropped just before this one. */
  return function allow(ip: string, type: string): { write: boolean; suppressed: number } {
    const t = now();
    const tk = types.get(type);
    const typeEntry = !tk || tk.reset <= t ? { n: 0, reset: t + windowMs } : tk;
    typeEntry.n += 1;
    types.set(type, typeEntry);

    const k = `${type}|${ip}`;
    const prev = keys.get(k);
    const e = !prev || prev.reset <= t ? { n: 0, reset: t + windowMs, dropped: prev?.dropped ?? 0 } : prev;
    e.n += 1;
    keys.set(k, e);
    if (keys.size > 10000) keys.clear();

    if (e.n > perKey || typeEntry.n > perType) {
      e.dropped += 1;
      return { write: false, suppressed: 0 };
    }
    const suppressed = e.dropped;
    e.dropped = 0;
    return { write: true, suppressed };
  };
}

/** Keeps an event's free-text fields small. */
export function clampDetails(details: Record<string, unknown> | undefined, max = 4000): Record<string, unknown> {
  if (!details) return {};
  try {
    const s = JSON.stringify(details);
    if (s.length <= max) return details;
    return { truncated: true, preview: s.slice(0, 500) };
  } catch {
    return { truncated: true };
  }
}
