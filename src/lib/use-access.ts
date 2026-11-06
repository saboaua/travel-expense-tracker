"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { effectivePermissions, legacyPermissions, type RoleRecord } from "@/lib/access";

export type Access = { role: string; label: string; perms: Set<string>; loaded: boolean };

/** Current user's role and the features it can use. Falls back to the old behaviour if roles are not set up yet. */
export function useAccess(refreshKey?: string): Access {
  const [state, setState] = useState<Access>({ role: "user", label: "User", perms: legacyPermissions("user"), loaded: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Read from the phone, so the menu keeps its items with no connection
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      const res = await loadWithCache(browserKv, `${user.id}:access`, async () => {
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
      if (cancelled) return;
      if (res.ok) setState({ role: res.data.role, label: res.data.label, perms: new Set(res.data.perms), loaded: true });
      else setState((s) => ({ ...s, loaded: true }));
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return state;
}
