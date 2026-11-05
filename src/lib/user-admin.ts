/**
 * Creating an account and changing a role, shared by the admin pages and the Telegram bot so both follow the
 * same rules. Callers check who is allowed; these functions do the work with a service-role client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTempPassword, tempPasswordWindow } from "@/lib/temp-password";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The role must exist (custom roles live in public.roles). Before the roles migration only the built-ins exist. */
export async function roleExists(admin: SupabaseClient, role: string): Promise<boolean> {
  if (role === "user") return true;
  const { data, error } = await admin.from("roles").select("key").eq("key", role).maybeSingle();
  return error ? ["assistant", "admin"].includes(role) : !!data;
}

export type CreateUserInput = { email: string; firstName?: string | null; lastName?: string | null; role?: string };
export type CreateUserResult =
  | { ok: true; userId: string; email: string; role: string; tempPassword: string; expiresAt: string; warning?: string }
  | { ok: false; status: number; error: string };

export async function createUserAccount(admin: SupabaseClient, input: CreateUserInput): Promise<CreateUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: "Email is required" };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, status: 400, error: "Enter a valid email address" };
  const role = input.role || "user";
  if (!(await roleExists(admin, role))) return { ok: false, status: 400, error: "That role does not exist." };

  const firstName = input.firstName || null;
  const lastName = input.lastName || null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const password = generateTempPassword();
  const { issuedAt, expiresAt } = tempPasswordWindow();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName },
  });
  if (createError) return { ok: false, status: 400, error: createError.message };
  if (!created.user) return { ok: false, status: 500, error: "User creation failed" };

  const baseProfile = {
    id: created.user.id,
    email,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    role,
    must_change_password: true,
    updated_at: new Date().toISOString(),
  };
  let { error: profileError } = await admin.from("profiles").upsert({ ...baseProfile, temp_password_issued_at: issuedAt, temp_password_expires_at: expiresAt });
  if (profileError) {
    // Fall back without the expiry columns (migration_temp_password.sql not run yet)
    profileError = (await admin.from("profiles").upsert(baseProfile)).error;
  }
  if (profileError) console.error("Profile upsert failed:", profileError);

  return {
    ok: true,
    userId: created.user.id,
    email,
    role,
    tempPassword: password,
    expiresAt,
    warning: profileError ? `Account created, but the profile row could not be saved (${profileError.message}). Run the latest SQL migrations in Supabase.` : undefined,
  };
}
