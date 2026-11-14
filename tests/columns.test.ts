/**
 * Every column named in src/lib/columns.ts must exist in supabase/*.sql (create table + add column), and no
 * production query may use select("*") again.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as C from "../src/lib/columns";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fail++; console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra); };

// ---- build table -> columns from the migrations ----
const cols = new Map<string, Set<string>>();
const add = (t: string, c: string) => { if (!cols.has(t)) cols.set(t, new Set()); cols.get(t)!.add(c); };
for (const f of readdirSync("supabase").filter((x) => x.endsWith(".sql")).sort()) {
  const sql = readFileSync(join("supabase", f), "utf8").replace(/--.*$/gm, "");
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    let depth = 0, cur = "";
    const parts: string[] = [];
    for (const ch of m[2]) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) {
      const w = p.trim().split(/\s+/)[0]?.replace(/"/g, "");
      if (w && !/^(constraint|primary|unique|check|foreign)$/i.test(w)) add(m[1], w);
    }
  }
  for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)\s+([\s\S]*?);/gi)) {
    for (const a of m[2].matchAll(/add column (?:if not exists )?(\w+)/gi)) add(m[1], a[1]);
  }
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const check = (label: string, table: string, spec: string) => {
  const missing = list(spec).filter((c) => !cols.get(table)?.has(c));
  ok(`${label} exists in ${table}`, missing.length === 0, `missing: ${missing.join(", ")}`);
};

check("TRIP_COLS", "trips", C.TRIP_COLS);
check("FLIGHT_COLS", "trip_flights", C.FLIGHT_COLS);
check("TRIP_EXPORT_COLS", "trips", C.TRIP_EXPORT_COLS);
check("EXPENSE_COLS", "expenses", C.EXPENSE_COLS);
check("PERSONAL_PROJECT_COLS", "personal_projects", C.PERSONAL_PROJECT_COLS);
check("PERSONAL_SPEND_COLS", "personal_spends", C.PERSONAL_SPEND_COLS);
check("UTILITY_BILL_COLS", "utility_bills", C.UTILITY_BILL_COLS);
check("BUDGET_COLS", "personal_budgets", C.BUDGET_COLS);
check("SAVINGS_PLAN_COLS", "savings_plans", C.SAVINGS_PLAN_COLS);
check("SAVINGS_PLAN_COLS_BASE", "savings_plans", C.SAVINGS_PLAN_COLS_BASE);
check("SAVINGS_EVENT_COLS", "savings_events", C.SAVINGS_EVENT_COLS);
check("FIXED_COST_COLS", "fixed_costs", C.FIXED_COST_COLS);
check("FIXED_ENTRY_COLS", "fixed_entries", C.FIXED_ENTRY_COLS);
check("PERSONAL_SPEND_COLS_MID", "personal_spends", C.PERSONAL_SPEND_COLS_MID);
check("PERSONAL_SPEND_COLS_BASE", "personal_spends", C.PERSONAL_SPEND_COLS_BASE);
check("PERSONAL_EXPENSE_COLS", "personal_expenses", C.PERSONAL_EXPENSE_COLS);
check("GROCERY_RECEIPT_COLS", "grocery_receipts", C.GROCERY_RECEIPT_COLS);
check("GROCERY_RECEIPT_COLS_BASE", "grocery_receipts", C.GROCERY_RECEIPT_COLS_BASE);
check("PRICE_CHECK_COLS", "price_checks", C.PRICE_CHECK_COLS);
check("GROCERY_ITEM_COLS", "grocery_items", C.GROCERY_ITEM_COLS);
check("DOCUMENT_COLS", "travel_documents", C.DOCUMENT_COLS);
check("SUBSCRIPTION_COLS", "subscriptions", C.SUBSCRIPTION_COLS);
check("IPTV_CLIENT_COLS", "iptv_clients", C.IPTV_CLIENT_COLS);
check("IPTV_CUSTOMER_COLS", "iptv_customers", C.IPTV_CUSTOMER_COLS);
check("IPTV_RENEWAL_COLS", "iptv_renewals", C.IPTV_RENEWAL_COLS);
check("PROFILE_HOME_PLACE_COLS", "profiles", C.PROFILE_HOME_PLACE_COLS);
check("PROFILE_HOME_WELCOME_COLS", "profiles", C.PROFILE_HOME_WELCOME_COLS);
check("TELEGRAM_PENDING_COLS_V2", "telegram_pending", C.TELEGRAM_PENDING_COLS_V2);
check("DOCUMENT_TILE_COLS", "travel_documents", C.DOCUMENT_TILE_COLS);
check("LOYALTY_CARD_COLS", "loyalty_cards", C.LOYALTY_CARD_COLS);
check("ROLE_COLS", "roles", C.ROLE_COLS);
check("SECURITY_EVENT_COLS", "security_events", C.SECURITY_EVENT_COLS);
check("AUDIT_LOG_COLS", "audit_logs", C.AUDIT_LOG_COLS);
check("HELP_TOPIC_COLS", "help_topics", C.HELP_TOPIC_COLS);
check("SUPPORT_REQUEST_COLS", "support_requests", C.SUPPORT_REQUEST_COLS);
check("TELEGRAM_PENDING_COLS", "telegram_pending", C.TELEGRAM_PENDING_COLS);
check("BRANDING_COLS", "app_settings", C.BRANDING_COLS);
check("PROFILE_HOME_COLS", "profiles", C.PROFILE_HOME_COLS);
ok("DOCUMENT_COLS_BASE has no optional column", !list(C.DOCUMENT_COLS_BASE).includes("document_number"));
ok("BRANDING_COLS_BASE has only original columns", list(C.BRANDING_COLS_BASE).join() === "app_name,logo_url,primary_color");

// ---- fallback helper ----
const err42703 = { code: "42703", message: 'column "document_number" does not exist' };
void (async () => {
  const seen: string[] = [];
  const r = await C.withColumnFallback(async (c) => { seen.push(c); return c === "full" ? { error: err42703, data: null } : { error: null, data: [1] }; }, "full", "base");
  ok("fallback retries with the base columns", seen.join() === "full,base" && !r.error);
  const seen2: string[] = [];
  await C.withColumnFallback(async (c) => { seen2.push(c); return { error: null, data: [] }; }, "full", "base");
  ok("no retry when the first query works", seen2.join() === "full");
  const seen3: string[] = [];
  const r3 = await C.withColumnFallback(async (c) => { seen3.push(c); return { error: { code: "42501", message: "permission denied" }, data: null }; }, "full", "base");
  ok("other errors are not retried", seen3.length === 1 && !!r3.error);
  ok("isMissingColumn: schema cache wording", C.isMissingColumn({ message: "Could not find the 'x' column of 'y' in the schema cache" }));

  // ---- no select("*") in app code ----
  const offenders: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && /select\(\s*["'`]\*/.test(readFileSync(p, "utf8"))) offenders.push(p); } };
  walk("src");
  ok('no select("*") left in src', offenders.length === 0, offenders.join(", "));
  process.exit(fail ? 1 : 0);
})();
