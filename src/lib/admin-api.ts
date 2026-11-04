import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/roles";
import { loadPermissions } from "@/lib/access-server";
import { getRequestMeta } from "@/lib/audit";
import { writeSecurityEvent } from "@/lib/security-log";

/** Verifies the caller is an admin/assistant and returns a service-role client. */
export async function requireUserManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  const myRole = (profile?.role as UserRole) || "user";
  if (!(await loadPermissions(supabase, myRole)).has("users.manage")) {
    await writeSecurityEvent(await getRequestMeta(), {
      eventType: "access_denied",
      severity: "warning",
      emailAttempted: user.email,
      userId: user.id,
      details: { api: "user management", role: myRole },
    });
    return { error: "Forbidden", status: 403 as const };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set.", status: 500 as const };
  }

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { admin, me: { id: user.id, email: profile?.email || user.email || null, role: myRole } };
}
