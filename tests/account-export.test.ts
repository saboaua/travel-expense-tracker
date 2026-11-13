import { EXPORT_TABLES, filePathsOf, isOwnPath } from "../src/lib/account-export";

import { readdirSync, readFileSync } from "node:fs";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const me = "11111111-1111-4111-8111-111111111111";

eq("own folder is allowed", isOwnPath(`${me}/a.jpg`, me), true);
eq("someone else's folder is refused", isOwnPath("22222222-2222-4222-8222-222222222222/a.jpg", me), false);
eq("parent-folder tricks are refused", isOwnPath(`${me}/../x/a.jpg`, me), false);
eq("non-text is refused", isOwnPath(null, me), false);
eq("only *_path fields from my folder are collected, once each", filePathsOf([
  { receipt_path: `${me}/r1.jpg`, note: `${me}/not-a-path-field` },
  { receipt_path: `${me}/r1.jpg` },
  { image_path: "other/x.jpg" },
  { file_path: `${me}/d.pdf` },
], me).sort(), [`${me}/d.pdf`, `${me}/r1.jpg`]);
eq("every exported table names its owner column", EXPORT_TABLES.every((t) => t.owner === "id" || t.owner === "user_id"), true);
eq("the profile is exported by its own id", EXPORT_TABLES.find((t) => t.table === "profiles")?.owner, "id");

// Every table that stores a user's rows must be exported, or be listed here with the reason it is not
const NOT_EXPORTED = new Set([
  "account_deletions", "push_queue", "push_sent_log", "push_subscriptions", "security_events", // system and delivery records
  "telegram_notify_prefs", "telegram_sent_log", // notification plumbing
  "grocery_online_matches", "grocery_online_prefs", "grocery_price_matches", // rebuilt from your receipts
  "sharing_settings", "trip_flights", "iptv_clients", "iptv_customers", // separate features with their own data tools
]);
const sql = readdirSync("supabase").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`supabase/${f}`, "utf8")).join("\n");
const owned: string[] = [];
for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) if (/\buser_id\b/.test(m[2])) owned.push(m[1]);
const exported = new Set(EXPORT_TABLES.map((t) => t.table));
eq("some user-owned tables were found in the SQL", owned.length > 10, true);
eq("every user-owned table is exported or explicitly left out", [...new Set(owned)].filter((t) => !exported.has(t) && !NOT_EXPORTED.has(t)), []);

if (fail) process.exit(1);
console.log("account export checks passed");
