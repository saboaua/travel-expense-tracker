import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Running a migration must never reset what an admin or a person has already saved: Pro limits, plans, payments, payment and trial settings.
 * Only "add column if not exists", "create table if not exists" and inserts that do nothing on conflict are safe by themselves.
 * Anything else on these tables must be reviewed and listed in REVIEWED with the reason, so a new migration cannot slip one in.
 */
const PROTECTED = ["pro_limits", "user_plans", "plan_payments", "payment_settings", "pro_trial_settings", "pro_bitcoin_settings"];
const REVIEWED: Record<string, string> = {
  "migration_limit_starts.sql": "moves the old single start day into the per-feature columns once, then clears it; runs only while the old column still exists",
  "migration_projects.sql": "starts the new projects limit today, only the first time its column is added",
  "migration_pro_trial.sql": "gives new accounts the free month from a trigger; never touches existing plans",
};

const dir = join(__dirname, "..", "supabase");
let fail = 0;
const bad = (file: string, why: string, sql: string) => { fail++; console.error(`FAIL ${file}: ${why}\n   ${sql.replace(/\s+/g, " ").slice(0, 160)}`); };

for (const file of readdirSync(dir).filter((f) => /^migration_.*\.sql$/.test(f))) {
  const raw = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "").toLowerCase();
  if (!PROTECTED.some((t) => raw.includes(t))) continue;
  const names = PROTECTED.join("|");
  const reviewed = file in REVIEWED;
  for (const m of raw.matchAll(new RegExp(`\\b(truncate\\s+(?:table\\s+)?(?:public\\.)?(?:${names}))\\b`, "g"))) bad(file, "truncates a settings table", m[0]);
  for (const m of raw.matchAll(new RegExp(`delete\\s+from\\s+(?:public\\.)?(?:${names})\\b[^;]*`, "g"))) bad(file, "deletes saved settings", m[0]);
  for (const m of raw.matchAll(new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?(?:${names})\\b[^;]*`, "g"))) bad(file, "drops a settings table", m[0]);
  for (const m of raw.matchAll(new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?(?:${names})\\s+drop\\s+column\\b[^;]*`, "g"))) bad(file, "drops a settings column", m[0]);
  for (const m of raw.matchAll(new RegExp(`\\bupdate\\s+(?:public\\.)?(?:${names})\\s+set\\b[^;]*`, "g"))) if (!reviewed) bad(file, "updates saved settings (review it, then list the file in REVIEWED)", m[0]);
  for (const m of raw.matchAll(new RegExp(`insert\\s+into\\s+(?:public\\.)?(?:${names})\\b[^;]*`, "g"))) {
    if (/on\s+conflict[^;]*do\s+update/.test(m[0])) bad(file, "an insert that overwrites saved settings", m[0]);
    else if (!/on\s+conflict[^;]*do\s+nothing/.test(m[0]) && !reviewed) bad(file, "an insert that is not safe to run twice (add on conflict do nothing)", m[0]);
  }
}
// The reviewed list must not hold files that no longer exist
for (const f of Object.keys(REVIEWED)) if (!readdirSync(dir).includes(f)) bad(f, "listed as reviewed but missing", "");

if (fail) process.exit(1);
console.log("migrations keep saved settings: ok");
