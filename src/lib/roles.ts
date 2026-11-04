/**
 * Roles are stored in the database (public.roles) and can be created by an admin.
 * What each role may do is decided by src/lib/access.ts (features) and loaded with access-server.ts.
 */
export type UserRole = string;

export const ROLE_LABELS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  admin: "Admin",
};

export function roleLabel(key: string, roles?: { key: string; label: string }[]): string {
  return roles?.find((r) => r.key === key)?.label ?? ROLE_LABELS[key] ?? key;
}

/** Only an admin can assign or change roles (an assistant or custom role can never promote anyone). */
export function canAssignRole(role: UserRole): boolean {
  return role === "admin";
}
