/**
 * A short memory of who has which role, kept by the server that checks access on every page. Without it each page
 * waits for one or two database answers before it can even start. A change of role is picked up within the time below.
 * Only people who are NOT in the middle of a forced password change are remembered, so that step is always checked fresh.
 */
const DEFAULT_SECONDS = 30;
const MAX_ENTRIES = 500;

const seconds = (): number => {
  const raw = process.env.ROLE_CACHE_SECONDS;
  const n = raw == null || raw === "" ? DEFAULT_SECONDS : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

type Timed<T> = { value: T; at: number };
const roles = new Map<string, Timed<string>>();
const permissions = new Map<string, Timed<Set<string>>>();

function read<T>(map: Map<string, Timed<T>>, key: string, now: number): T | null {
  const ttl = seconds() * 1000;
  if (!ttl) return null;
  const hit = map.get(key);
  if (!hit) return null;
  if (now - hit.at >= ttl) { map.delete(key); return null; }
  return hit.value;
}

function write<T>(map: Map<string, Timed<T>>, key: string, value: T, now: number): void {
  if (!seconds()) return;
  if (map.size >= MAX_ENTRIES && !map.has(key)) map.delete(map.keys().next().value as string);
  map.set(key, { value, at: now });
}

export const cachedRole = (userId: string, now = Date.now()) => read(roles, userId, now);
export const rememberRole = (userId: string, role: string, now = Date.now()) => write(roles, userId, role, now);
export const cachedPermissions = (role: string, now = Date.now()) => read(permissions, role, now);
export const rememberPermissions = (role: string, set: Set<string>, now = Date.now()) => write(permissions, role, set, now);
export function clearRoleCache(): void { roles.clear(); permissions.clear(); }
