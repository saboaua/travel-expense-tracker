/**
 * Role-based access: a registry of features (the "options" of the app) and the rules that decide
 * which roles can use them. Pure functions, no I/O, so they are unit-tested.
 *
 * To add a new option to the app: add one entry to FEATURES (and, if it is a page, list its path).
 * It then shows up in Admin > Roles for every role, marked "New", until an admin reviews it.
 * Until reviewed, only roles listed in `defaultRoles` get it (custom roles get nothing: secure by default).
 */

export type FeatureGroup = "App" | "Administration";

type Feature = {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  /** Path prefixes this feature protects */
  paths: string[];
  /** Roles that get this feature automatically while it is still unreviewed */
  defaultRoles: string[];
};

export const FEATURES: Feature[] = [
  { key: "trips", label: "Trips & expenses", description: "Create trips, add and scan receipts.", group: "App", paths: ["/trips"], defaultRoles: ["user", "assistant"] },
  { key: "reports", label: "Reports", description: "Spending reports and exports.", group: "App", paths: ["/reports"], defaultRoles: ["user", "assistant"] },
  // listed before "personal" so /personal/loyalty is matched by this feature first
  { key: "loyalty", label: "Loyalty cards", description: "Store cards with a scannable barcode, kept in Personal.", group: "App", paths: ["/personal/loyalty"], defaultRoles: ["user", "assistant"] },
  { key: "personal", label: "Personal", description: "Groceries, home projects and personal travel.", group: "App", paths: ["/personal"], defaultRoles: ["user", "assistant"] },
  { key: "personal.dashboard", label: "Personal dashboard", description: "Business / Personal switch on the home page, with spending charts for personal receipts.", group: "App", paths: [], defaultRoles: ["user", "assistant"] },
  { key: "documents", label: "Documents & passport", description: "Passport, visas and trip documents.", group: "App", paths: ["/documents"], defaultRoles: ["user", "assistant"] },
  { key: "users.manage", label: "Create users", description: "Create users and reset temporary passwords (not roles).", group: "Administration", paths: ["/admin/users"], defaultRoles: ["assistant"] },
  { key: "security.view", label: "Security & audit", description: "See security events and the audit log.", group: "Administration", paths: ["/admin/security"], defaultRoles: [] },
  { key: "categories.manage", label: "Categories", description: "Edit receipt, grocery and travel categories.", group: "Administration", paths: ["/admin/categories", "/admin/travel-categories"], defaultRoles: [] },
  { key: "currencies.manage", label: "Currencies", description: "Enable, disable and order currencies.", group: "Administration", paths: ["/admin/currencies"], defaultRoles: [] },
  { key: "branding.manage", label: "Branding", description: "App name, logo, colors, privacy policy and support email.", group: "Administration", paths: ["/admin/branding"], defaultRoles: [] },
  { key: "telegram.manage", label: "Telegram", description: "Bot token and notification settings.", group: "Administration", paths: ["/admin/telegram"], defaultRoles: [] },
  { key: "support.view", label: "Support requests", description: "Read messages from the login contact form.", group: "Administration", paths: ["/admin/support"], defaultRoles: [] },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));
const ADMIN_FEATURE_KEYS = FEATURES.filter((f) => f.group === "Administration").map((f) => f.key);

const SYSTEM_ROLES = ["user", "assistant", "admin"] as const;
export const isSystemRole = (key: string) => (SYSTEM_ROLES as readonly string[]).includes(key);

export type RoleRecord = {
  key: string;
  label?: string;
  description?: string | null;
  permissions: string[];
  /** Features the admin has already reviewed for this role */
  known_features: string[];
  is_system?: boolean;
};

/** Features this role can use. Admin always gets everything, including options added later. */
export function effectivePermissions(role: Pick<RoleRecord, "key" | "permissions" | "known_features">): Set<string> {
  if (role.key === "admin") return new Set(FEATURE_KEYS);
  const out = new Set((role.permissions || []).filter((k) => BY_KEY.has(k)));
  const known = new Set(role.known_features || []);
  for (const f of FEATURES) {
    if (!known.has(f.key) && f.defaultRoles.includes(role.key)) out.add(f.key);
  }
  return out;
}

/** Used when the roles table is not available yet (migration not run): behave like before roles existed. */
export function legacyPermissions(roleKey: string): Set<string> {
  return effectivePermissions({ key: roleKey === "assistant" || roleKey === "admin" ? roleKey : "user", permissions: [], known_features: [] });
}

/** Features an admin has not reviewed yet for this role (shown as "New"). */
export function unreviewedFeatures(role: Pick<RoleRecord, "key" | "known_features">): Feature[] {
  if (role.key === "admin") return [];
  const known = new Set(role.known_features || []);
  return FEATURES.filter((f) => !known.has(f.key));
}

export const hasAnyAdminFeature = (perms: Set<string>) => ADMIN_FEATURE_KEYS.some((k) => perms.has(k));

type PathRule = { kind: "open" } | { kind: "feature"; key: string } | { kind: "adminOnly" } | { kind: "hub" };

export function ruleForPath(path: string): PathRule {
  const clean = path.split("?")[0];
  const matches = (prefix: string) => clean === prefix || clean.startsWith(`${prefix}/`);
  if (matches("/admin/roles")) return { kind: "adminOnly" };
  if (matches("/admin/settings")) return { kind: "hub" };
  for (const f of FEATURES) if (f.paths.some(matches)) return { kind: "feature", key: f.key };
  if (clean === "/admin" || clean.startsWith("/admin/")) return { kind: "adminOnly" }; // unknown admin pages stay admin-only
  return { kind: "open" };
}

export function canAccessPath(roleKey: string, perms: Set<string>, path: string): boolean {
  if (roleKey === "admin") return true;
  const rule = ruleForPath(path);
  switch (rule.kind) {
    case "open": return true;
    case "adminOnly": return false;
    case "hub": return hasAnyAdminFeature(perms);
    case "feature": return perms.has(rule.key);
  }
}

/* ---------------- validating role edits ---------------- */

export const RESERVED_ROLE_KEYS = new Set(["admin", "user", "assistant", "owner", "root", "system", "anonymous", "authenticated", "service_role"]);

/** "Sales Team!" -> "sales-team" (2-30 chars, starts with a letter). Returns null when nothing usable is left. */
export function slugifyRoleKey(label: string): string | null {
  const s = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  if (!/^[a-z][a-z0-9-]{1,29}$/.test(s)) return null;
  return s;
}

/** Keeps only known feature keys, no duplicates. */
export function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((k): k is string => typeof k === "string" && BY_KEY.has(k)))];
}

export function sanitizeLabel(input: unknown, max = 40): string | null {
  if (typeof input !== "string") return null;
  const t = input.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);
  return t || null;
}

/* ---------------- navigation ---------------- */

type AdminNavItem = { href: string; label: string; kind: "security" | "users" | "settings" | "other" };

const NAV_LABEL: Record<string, string> = { "users.manage": "Users" };

/**
 * Management links in the menu. Admin sees Security + Global Settings. Other roles see Security when
 * allowed, and either a direct link (one delegated feature) or a "Management" hub (several).
 */
export function adminNavItems(roleKey: string, perms: Set<string>): AdminNavItem[] {
  if (roleKey === "admin") {
    return [
      { href: "/admin/security", label: "Security", kind: "security" },
      { href: "/admin/settings", label: "Global Settings", kind: "settings" },
    ];
  }
  const out: AdminNavItem[] = [];
  if (perms.has("security.view")) out.push({ href: "/admin/security", label: "Security", kind: "security" });
  const others = FEATURES.filter((f) => f.group === "Administration" && f.key !== "security.view" && perms.has(f.key));
  if (others.length === 1) {
    out.push({ href: others[0].paths[0], label: NAV_LABEL[others[0].key] ?? others[0].label, kind: others[0].key === "users.manage" ? "users" : "other" });
  } else if (others.length > 1) {
    out.push({ href: "/admin/settings", label: "Management", kind: "settings" });
  }
  return out;
}

