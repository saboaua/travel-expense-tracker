/**
 * Notices a person closed ("hide for a week"). Kept on their account so removing the app from the home screen
 * and adding it back does not bring them back; the browser copy is only a fast start and works offline.
 * Pure helpers (unit-tested) are at the top, the browser/database part is below.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SNOOZE_DAYS } from "@/lib/notifications";

export type Dismissed = Record<string, number>;
export const DISMISSED_STORAGE_KEY = "notifications-dismissed";
const DAY = 86_400_000;
/** Rows kept at most: a safety stop so the list can never grow without limit */
const MAX_KEPT = 200;

/** Only { key: timestamp } pairs survive; anything else (bad JSON, arrays, text) becomes empty. */
export function cleanDismissed(raw: unknown): Dismissed {
  const out: Dismissed = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && k.length <= 200) out[k] = v;
  }
  return out;
}

/** Both lists combined: when the same notice is in both, the later close wins. */
export function mergeDismissed(a: Dismissed, b: Dismissed): Dismissed {
  const out: Dismissed = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

/** Drops closes older than the snooze (they no longer hide anything), and keeps the newest MAX_KEPT. */
export function pruneDismissed(d: Dismissed, now: number): Dismissed {
  const fresh = Object.entries(d).filter(([, at]) => now - at < SNOOZE_DAYS * DAY);
  fresh.sort((x, y) => y[1] - x[1]);
  return Object.fromEntries(fresh.slice(0, MAX_KEPT));
}

/* ---------------- browser + database ---------------- */

export function readLocalDismissed(): Dismissed {
  try { return cleanDismissed(JSON.parse(localStorage.getItem(DISMISSED_STORAGE_KEY) || "{}")); } catch { return {}; }
}
function writeLocalDismissed(d: Dismissed) {
  try { localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(d)); } catch { /* private mode: the account copy still holds it */ }
}

type Db = SupabaseClient;

/** Reads the account copy. Returns null when it cannot be read (offline, signed out, or the migration is not run yet). */
async function readRemote(db: Db): Promise<{ id: string; list: Dismissed } | null> {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return null;
    const { data, error } = await db.from("profiles").select("dismissed_notices").eq("id", session.user.id).maybeSingle();
    if (error || !data) return null;
    return { id: session.user.id, list: cleanDismissed(data.dismissed_notices) };
  } catch { return null; }
}

/** What is hidden right now: this device's copy plus the account's. The account list is copied back to the device. */
export async function loadDismissed(db: Db): Promise<Dismissed> {
  const local = readLocalDismissed();
  const remote = await readRemote(db);
  if (!remote) return local;
  const merged = pruneDismissed(mergeDismissed(local, remote.list), Date.now());
  writeLocalDismissed(merged);
  return merged;
}

/** Remembers one close, on this device straight away and on the account when it can. */
export async function rememberDismissed(db: Db, key: string, at = Date.now()): Promise<Dismissed> {
  const next = pruneDismissed(mergeDismissed(readLocalDismissed(), { [key]: at }), at);
  writeLocalDismissed(next);
  const remote = await readRemote(db);
  if (remote) {
    const merged = pruneDismissed(mergeDismissed(next, remote.list), at);
    writeLocalDismissed(merged);
    try { await db.from("profiles").update({ dismissed_notices: merged }).eq("id", remote.id); } catch { /* retried at the next close */ }
    return merged;
  }
  return next;
}
