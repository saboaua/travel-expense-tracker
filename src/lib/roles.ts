export type UserRole = "user" | "assistant" | "admin";

export const ROLE_LABELS: Record<UserRole, string> = {
  user: "User",
  assistant: "Assistant",
  admin: "Admin",
};

/** Nav items each role can see */
export function canAccessPath(role: UserRole, path: string): boolean {
  if (role === "admin") return true;

  // Assistant: same as user + user management (create users only)
  if (role === "assistant") {
    if (path.startsWith("/admin/security")) return false;
    if (path.startsWith("/admin/branding")) return false;
    if (path.startsWith("/admin")) return true; // users page
    return isUserPath(path);
  }

  // Regular user
  if (path.startsWith("/admin")) return false;
  return isUserPath(path);
}

function isUserPath(path: string): boolean {
  if (path === "/" || path.startsWith("/trips")) return true;
  if (path.startsWith("/profile")) return true;
  if (path.startsWith("/settings")) return true;
  // Reports can stay for users or be admin-only — keep for users
  if (path.startsWith("/reports")) return true;
  return false;
}

export function canCreateUsers(role: UserRole): boolean {
  return role === "admin" || role === "assistant";
}

export function canAssignRole(role: UserRole): boolean {
  return role === "admin";
}

export function canManageBranding(role: UserRole): boolean {
  return role === "admin";
}

export function canViewSecurity(role: UserRole): boolean {
  return role === "admin";
}
