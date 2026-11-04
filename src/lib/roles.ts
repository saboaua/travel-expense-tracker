/**
 * Roles are stored in the database (public.roles) and can be created by an admin.
 * What each role may do is decided by src/lib/access.ts (features) and loaded with access-server.ts.
 */
export type UserRole = string;

/** Only an admin can assign or change roles (an assistant or custom role can never promote anyone). */
export function canAssignRole(role: UserRole): boolean {
  return role === "admin";
}
