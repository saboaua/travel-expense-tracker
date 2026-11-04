"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { effectivePermissions, legacyPermissions, type RoleRecord } from "@/lib/access";

export type Access = { role: string; label: string; perms: Set<string>; loaded: boolean };

/** Current user's role and the features it can use. Falls back to the old behaviour if roles are not set up yet. */
export function useAccess(refreshKey?: string): Access {
  const [state, setState] = useState<Access>({ role: "user", label: "User", perms: legacyPermissions("user"), loaded: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
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
      if (!cancelled) setState({ role, label, perms, loaded: true });
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return state;
}
