import { createClient } from "@/lib/supabase/server";

export type UserRole = "user" | "admin";

export interface AppUser {
  id: string;
  email: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password, first_name, last_name, full_name, avatar_url, email")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: profile?.email || user.email || null,
    role: (profile?.role as UserRole) || "user",
    mustChangePassword: profile?.must_change_password ?? false,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    fullName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return user;
}
