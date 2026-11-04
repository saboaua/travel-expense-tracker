import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_KEYS, effectivePermissions, legacyPermissions, type RoleRecord } from "@/lib/access";

/**
 * Features the given role can use. Falls back to the pre-roles behaviour when the roles table is
 * missing (migration_roles.sql not run yet) or the role no longer exists, so nobody is locked out.
 */
export async function loadPermissions(client: SupabaseClient, roleKey: string): Promise<Set<string>> {
  if (roleKey === "admin") return new Set(FEATURE_KEYS);
  try {
    const { data, error } = await client.from("roles").select("key, permissions, known_features").eq("key", roleKey).maybeSingle();
    if (error || !data) return legacyPermissions(roleKey);
    return effectivePermissions(data as RoleRecord);
  } catch {
    return legacyPermissions(roleKey);
  }
}
