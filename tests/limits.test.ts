import { DEFAULT_LIMITS, docStatus, featureLocked, limitsActive, nextMonth, parseLimits, proComparison, readLimits, scanStatus } from "../src/lib/limits";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const FREE = { pro: false, admin: false }, PRO = { pro: true, admin: false }, ADMIN = { pro: true, admin: true };
const on = { ...DEFAULT_LIMITS, starts_on: "2026-12-01" };

// Off until the start day
eq("off with no date", limitsActive(DEFAULT_LIMITS, "2026-12-05"), false);
eq("off before the date", limitsActive(on, "2026-11-30"), false);
eq("on from the date", limitsActive(on, "2026-12-01"), true);
eq("nothing locked before", featureLocked(on, FREE, "bills_email", "2026-11-30"), false);
eq("free is locked after", featureLocked(on, FREE, "bills_email", "2026-12-01"), true);
eq("pro is never locked", featureLocked(on, PRO, "bills_email", "2026-12-01"), false);
eq("admin is never locked", featureLocked(on, ADMIN, "telegram_save", "2026-12-01"), false);
eq("a switched-off feature is free", featureLocked({ ...on, pro_telegram_summary: false }, FREE, "telegram_summary", "2026-12-01"), false);
eq("each feature has its own switch", featureLocked({ ...on, pro_doc_reminders: false }, FREE, "bills_email", "2026-12-01"), true);

// AI scans
const s7 = scanStatus(on, FREE, 7, "2026-12-10");
eq("7 of 10", [s7.limited, s7.limit, s7.used, s7.left, s7.exhausted], [true, 10, 7, 3, false]);
const s10 = scanStatus(on, FREE, 10, "2026-12-10");
eq("10 of 10 is used up", [s10.exhausted, s10.left, s10.resetsLabel, s10.resetsOn], [true, 0, "1 January", "2027-01-01"]);
eq("pro is not limited", scanStatus(on, PRO, 500, "2026-12-10").exhausted, false);
eq("admin is not limited", scanStatus(on, ADMIN, 500, "2026-12-10").limited, false);
eq("not limited before the start", scanStatus(on, FREE, 500, "2026-11-20").exhausted, false);
eq("zero scans on Free", scanStatus({ ...on, free_ai_scans: 0 }, FREE, 0, "2026-12-10").exhausted, true);
eq("December rolls to January", nextMonth("2026-12-31"), { iso: "2027-01-01", label: "1 January" });
eq("November to December", nextMonth("2026-11-15"), { iso: "2026-12-01", label: "1 December" });

// Documents
eq("free holds 2", docStatus(on, FREE, 2, "2026-12-10"), { limit: 2, count: 2, full: true });
eq("free with 1", docStatus(on, FREE, 1, "2026-12-10").full, false);
eq("free over the limit already (kept, cannot add)", docStatus(on, FREE, 5, "2026-12-10").full, true);
eq("pro holds 100", docStatus(on, PRO, 99, "2026-12-10"), { limit: 100, count: 99, full: false });
eq("pro full at 100", docStatus(on, PRO, 100, "2026-12-10").full, true);
eq("admin has no limit", docStatus(on, ADMIN, 1000, "2026-12-10").limit, null);
eq("no limit before the start", docStatus(on, FREE, 50, "2026-11-30").limit, null);

// Admin input
const ok = parseLimits({ starts_on: "2026-12-01", free_ai_scans: "10", free_documents: 2, pro_documents: "100", pro_bills_email: true, pro_telegram_save: false });
eq("parse ok", ok.ok && [ok.value.starts_on, ok.value.free_ai_scans, ok.value.free_documents, ok.value.pro_documents, ok.value.pro_bills_email, ok.value.pro_telegram_save, ok.value.pro_doc_reminders], ["2026-12-01", 10, 2, 100, true, false, true]);
eq("empty date means off", parseLimits({ starts_on: "", free_ai_scans: 10, free_documents: 2, pro_documents: 100 }).ok && (parseLimits({ starts_on: "", free_ai_scans: 10, free_documents: 2, pro_documents: 100 }) as { value: { starts_on: string | null } }).value.starts_on, null);
eq("bad date", parseLimits({ starts_on: "soon", free_ai_scans: 10, free_documents: 2, pro_documents: 100 }).ok, false);
eq("scans not a number", parseLimits({ free_ai_scans: "ten", free_documents: 2, pro_documents: 100 }).ok, false);
eq("scans too high", parseLimits({ free_ai_scans: 5000, free_documents: 2, pro_documents: 100 }).ok, false);
eq("decimals refused", parseLimits({ free_ai_scans: 2.5, free_documents: 2, pro_documents: 100 }).ok, false);
eq("pro below free refused", parseLimits({ free_ai_scans: 10, free_documents: 5, pro_documents: 3 }).ok, false);
eq("missing number refused", parseLimits({ free_documents: 2, pro_documents: 100 }).ok, false);
eq("zero free documents is allowed", parseLimits({ free_ai_scans: 0, free_documents: 0, pro_documents: 10 }).ok, true);

// Rows from the database
eq("strings from the database", readLimits({ starts_on: "2026-12-01", free_ai_scans: "7", free_documents: "3", pro_documents: "50", pro_bills_email: false }), { ...DEFAULT_LIMITS, starts_on: "2026-12-01", free_ai_scans: 7, free_documents: 3, pro_documents: 50, pro_bills_email: false });
eq("a missing row gives the defaults", readLimits(null), DEFAULT_LIMITS);
eq("a junk date is ignored", readLimits({ starts_on: "soon" }).starts_on, null);

// The table on the Get Pro page follows the switches
eq("table follows the switches", proComparison({ ...on, pro_bills_email: false, pro_telegram_save: false, pro_telegram_summary: false, pro_doc_reminders: false }).map((r) => r.label), ["AI receipt scans", "Documents", "Excel and PDF reports"]);
eq("full table", proComparison(on).length, 7);
eq("table numbers", proComparison(on)[0], { label: "AI receipt scans", free: "10 a month", pro: "No limit" });

if (fail) process.exit(1);
console.log("limits tests passed");
