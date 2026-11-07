"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { effectivePermissions, legacyPermissions, type RoleRecord } from "@/lib/access";

export type Access = { role: string; label: string; perms: Set<string>; loaded: boolean };

const INITIAL: Access = { role: "user", label: "User", perms: legacyPermissions("user"), loaded: false };
/** Asked again at most this often while moving around the app (the menu, tabs and chips all share one answer). */
const FRESH_MS = 60_000;

let current: { userId: string; access: Access; at: number } | null = null;
let failed: Access | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Forget the answer (on sign-out) so the next person never sees the previous one's menu. */
export function resetAccessCache() {
  current = null;
  failed = null;
  inflight = null;
  emit();
}

async function fetchAccess(): Promise<void> {
  const supabase = createClient();
  // Read from the phone, so the menu keeps its items with no connection
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;
  if (current && current.userId === user.id && Date.now() - current.at < FRESH_MS) return;
  const res = await loadWithCache(browserKv, `${user.id}:access`, async () => {
    // The role comes first, then what that role may do
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profileError) return { data: null, error: profileError };
    const role = (profile?.role as string) || "user";
    let perms = legacyPermissions(role);
    let label = role.charAt(0).toUpperCase() + role.slice(1);
    if (role === "admin") perms = effectivePermissions({ key: "admin", permissions: [], known_features: [] });
    else {
      const { data, error } = await supabase.from("roles").select("key, label, permissions, known_features").eq("key", role).maybeSingle();
      if (!error && data) {
        perms = effectivePermissions(data as RoleRecord);
        label = (data as RoleRecord).label || label;
      }
    }
    return { data: { role, label, perms: [...perms] }, error: null };
  });
  if (res.ok) {
    current = { userId: user.id, at: Date.now(), access: { role: res.data.role, label: res.data.label, perms: new Set(res.data.perms), loaded: true } };
    failed = null;
  } else {
    failed = { ...(current?.access ?? INITIAL), loaded: true };
  }
  emit();
}

function ensureAccess(): Promise<void> {
  if (current && Date.now() - current.at < FRESH_MS) return Promise.resolve();
  if (!inflight) inflight = fetchAccess().catch(() => {}).finally(() => { inflight = null; });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const snapshot = () => current?.access ?? failed ?? INITIAL;

/**
 * Current user's role and the features it can use. Falls back to the old behaviour if roles are not set up yet.
 * Everything on screen shares one answer, refreshed at most once a minute, so changing pages costs no extra requests.
 * (The argument is accepted for old callers; moving between pages no longer triggers a new question.)
 */
export function useAccess(refreshKey?: string): Access {
  void refreshKey;
  const access = useSyncExternalStore(subscribe, snapshot, () => INITIAL);
  useEffect(() => { void ensureAccess(); }, []);
  return access;
}
