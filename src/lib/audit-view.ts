/**
 * How the audit trail reads on screen: a plain sentence for each entry and a group (Personal, Business, Account, Admin) to filter by.
 * The trail shows what happened and who did it, never what was written or how much.
 */
export type AuditGroup = "Personal" | "Business" | "Account" | "Admin";
export const AUDIT_GROUPS: AuditGroup[] = ["Personal", "Business", "Account", "Admin"];

export const GROUP_HELP: Record<AuditGroup, string> = {
  Personal: "Receipts, spending, savings, reminders, bills, documents, sharing",
  Business: "Trips, expenses, projects",
  Account: "Profile, plans, subscriptions, sign-up and support requests",
  Admin: "Users, roles, payments, imports, settings",
};

const GROUP_TYPES: Record<AuditGroup, string[]> = {
  Personal: ["grocery_receipts", "personal_expenses", "personal_projects", "personal_spends", "personal_budgets", "savings_plans", "savings_events", "reminders", "loyalty_cards", "utility_bills", "fixed_costs", "fixed_entries", "fuel_fillups", "travel_documents", "shares", "sharing_settings", "bill_email_senders"],
  Business: ["trips", "expenses", "trip_flights", "trip_papers", "business_projects", "business_project_receipts"],
  Account: ["profiles", "subscriptions", "user_plans", "account_requests", "support_requests"],
  Admin: ["user", "role", "settings", "account_request", "plan_payments", "shared_prices", "store_catalog", "store_categories", "supermarket_places"],
};

/** The record types that belong to a group, for the filter. */
export const groupTypes = (g: string | null | undefined): string[] | null => (g && g in GROUP_TYPES ? GROUP_TYPES[g as AuditGroup] : null);

/** Which group an entry belongs to; null for a type this list does not know. */
export function groupOf(entityType: string | null | undefined): AuditGroup | null {
  if (!entityType) return null;
  return AUDIT_GROUPS.find((g) => GROUP_TYPES[g].includes(entityType)) ?? null;
}

const NOUN: Record<string, string> = {
  grocery_receipts: "a grocery receipt", personal_expenses: "a personal expense", personal_projects: "a personal project", personal_spends: "a quick spend",
  personal_budgets: "a budget", savings_plans: "a savings plan", savings_events: "a savings entry", reminders: "a reminder", loyalty_cards: "a loyalty card",
  utility_bills: "a utility bill", fixed_costs: "a fixed cost", fixed_entries: "a fixed-cost payment", fuel_fillups: "a fuel fill-up", travel_documents: "a travel document",
  shares: "a share", sharing_settings: "sharing settings", bill_email_senders: "a bill email sender", trips: "a trip", expenses: "an expense", trip_flights: "a flight",
  trip_papers: "a trip paper", business_projects: "a business project", business_project_receipts: "a project receipt", subscriptions: "a subscription",
  plan_payments: "a plan payment", user_plans: "a plan", profiles: "a profile", account_requests: "an account request", support_requests: "a support request",
};
const VERB: Record<string, string> = { created: "added", updated: "changed", deleted: "deleted" };
// the few that do not read well as add / change / delete
const SPECIAL: Record<string, string> = {
  "profiles.created": "created an account", "profiles.updated": "changed their profile", "profiles.deleted": "deleted an account",
  "support_requests.created": "sent a support request", "account_requests.created": "asked for an account",
  "sharing_settings.created": "set up sharing", "sharing_settings.updated": "changed sharing settings", "user_plans.created": "was given a plan", "user_plans.updated": "had a plan changed", "user_plans.deleted": "had a plan removed",
};
// what an admin did, by the action the server writes
const ADMIN: Record<string, string> = {
  "user.created": "created an account", "user.deleted": "deleted an account", "user.role_changed": "changed a user's role", "user.temp_password_issued": "issued a temporary password",
  "role.created": "created a role", "role.updated": "changed a role", "role.deleted": "deleted a role",
  "plan.set": "set a plan", "plan.removed": "removed a plan", "payment.recorded": "recorded a payment", "payment.confirmed": "confirmed a payment", "payment.rejected": "rejected a payment",
  "payment_settings.updated": "changed the payment settings", "pro_limits.updated": "changed the Pro limits", "pro_trial.updated": "changed the Pro trial", "telegram.settings_updated": "changed the Telegram settings",
  "places.added": "added supermarket places", "places.removed": "removed supermarket places", "places.fixed": "checked a supermarket place", "directory.store_moved": "moved a store in the directory",
  "catalog.imported": "imported a store catalog", "community_prices.imported": "imported community prices",
};

const words = (s: string) => s.replace(/[._]+/g, " ").trim();

export type AuditLike = { action: string; actor_email?: string | null; actor_id?: string | null; entity_type?: string | null; details?: Record<string, unknown> | null };

/** "pat@example.com" or a stand-in when nobody was signed in. */
export function actorName(a: AuditLike): string {
  if (a.actor_email) return a.actor_email;
  if (a.actor_id || a.details?.owner_id) return "A user";
  return a.action.startsWith("support_requests") || a.action.startsWith("account_requests") ? "Not signed in" : "System";
}

/** What was done, as the end of a sentence: "added a grocery receipt". */
export function actionText(a: AuditLike): string {
  if (ADMIN[a.action]) return ADMIN[a.action];
  if (SPECIAL[a.action]) return SPECIAL[a.action];
  const [table, op] = a.action.split(".");
  if (NOUN[table] && VERB[op]) return `${VERB[op]} ${NOUN[table]}`;
  return words(a.action);
}

/** "title, due date", or null when the entry has no list of changes. */
export function changedText(details: Record<string, unknown> | null | undefined): string | null {
  const c = details?.changed;
  if (!Array.isArray(c) || c.length === 0) return null;
  return c.map((x) => words(String(x))).slice(0, 8).join(", ") + (c.length > 8 ? " and more" : "");
}
