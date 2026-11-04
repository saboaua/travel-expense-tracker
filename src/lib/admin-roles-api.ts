import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getRequestMeta } from "@/lib/audit";
import { writeSecurityEvent } from "@/lib/security-log";

/** Roles and role assignment are admin-only: a delegated role can never grant access to itself or others. */
export async function requireAdminService() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    await writeSecurityEvent(await getRequestMeta(), {
      eventType: "access_denied",
      severity: "warning",
      emailAttempted: user.email,
      userId: user.id,
      details: { api: "roles", role: profile?.role || "unknown" },
    });
    return { error: "Forbidden", status: 403 as const };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set.", status: 500 as const };

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, me: { id: user.id, email: profile?.email || user.email || null } };
}

export const ROLES_MISSING = "Roles are not set up yet. Run supabase/migration_roles.sql in the Supabase SQL Editor.";
export const isMissingTable = (m: string) => /relation|schema cache|does not exist/i.test(m);
