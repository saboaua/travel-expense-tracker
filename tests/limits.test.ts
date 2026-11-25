import { DEFAULT_LIMITS, LIMIT_KEYS, docStatus, featureLocked, limitOn, limitsActive, limitsRow, nextMonth, papersStatus, parseLimits, proComparison, readLimits, scanStatus, sharingStatus, type LimitKey, type Limits } from "../src/lib/limits";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const FREE = { pro: false, admin: false }, PRO = { pro: true, admin: false }, ADMIN = { pro: true, admin: true };
const starts = (d: string | null, only?: LimitKey[]) => Object.fromEntries(LIMIT_KEYS.map((k) => [k, !only || only.includes(k) ? d : null])) as Limits["starts"];
const on: Limits = { ...DEFAULT_LIMITS, starts: starts("2026-12-01") };

// Off until the start day
eq("off with no date", limitsActive({ ...DEFAULT_LIMITS, starts: starts("2099-01-01", []) }, "2026-12-05"), false);
eq("projects are limited from the start", limitOn(DEFAULT_LIMITS, "projects", "2026-12-05"), true);
eq("off before the date", limitsActive(on, "2026-11-30"), false);
eq("on from the date", limitsActive(on, "2026-12-01"), true);
eq("forwarding order emails is Pro from the start, Pro and admins keep it", [featureLocked(DEFAULT_LIMITS, FREE, "orders_email", "2026-11-25"), featureLocked(DEFAULT_LIMITS, { pro: true, admin: false }, "orders_email", "2026-11-25"), featureLocked(DEFAULT_LIMITS, { pro: false, admin: true }, "orders_email", "2026-11-25")], [true, false, false]);
eq("a database without the orders column still reads it as on", readLimits({ starts_bills_email: null }).starts.orders_email, "2026-01-01");
eq("the admin can switch it off", featureLocked(readLimits({ starts_orders_email: null }), FREE, "orders_email", "2026-11-25"), false);
eq("nothing locked before", featureLocked(on, FREE, "bills_email", "2026-11-30"), false);
eq("free is locked after", featureLocked(on, FREE, "bills_email", "2026-12-01"), true);
eq("pro is never locked", featureLocked(on, PRO, "bills_email", "2026-12-01"), false);
eq("admin is never locked", featureLocked(on, ADMIN, "telegram_save", "2026-12-01"), false);
eq("a feature with no start is free", featureLocked({ ...on, starts: starts("2026-12-01", ["bills_email"]) }, FREE, "telegram_summary", "2026-12-01"), false);
eq("each feature has its own start", featureLocked({ ...on, starts: starts("2026-12-01", ["doc_reminders"]) }, FREE, "bills_email", "2026-12-01"), false);
eq("one on, another later", [limitOn({ ...on, starts: { ...on.starts, documents: "2027-01-01" } }, "ai_scans", "2026-12-05"), limitOn({ ...on, starts: { ...on.starts, documents: "2027-01-01" } }, "documents", "2026-12-05")], [true, false]);
eq("any limit on", limitsActive({ ...DEFAULT_LIMITS, starts: starts("2026-12-01", ["trip_papers"]) }, "2026-12-05"), true);
eq("AI scans limit only when its own start has come", scanStatus({ ...on, starts: starts("2026-12-01", ["documents"]) }, FREE, 500, "2026-12-10").limited, false);
eq("documents limit only when its own start has come", docStatus({ ...on, starts: starts("2026-12-01", ["ai_scans"]) }, FREE, 50, "2026-12-10").limit, null);


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


// Sharing and trip papers
eq("sharing: free holds 1", sharingStatus(on, FREE, 1, "2026-12-10"), { limit: 1, count: 1, full: true });
eq("sharing: free with none", sharingStatus(on, FREE, 0, "2026-12-10").full, false);
eq("sharing: pro has no limit", sharingStatus(on, PRO, 50, "2026-12-10").limit, null);
eq("sharing: admin has no limit", sharingStatus(on, ADMIN, 50, "2026-12-10").full, false);
eq("sharing: off before the start", sharingStatus(on, FREE, 5, "2026-11-30").limit, null);
eq("papers: free holds 3", papersStatus(on, FREE, 3, "2026-12-10"), { limit: 3, count: 3, full: true });
eq("papers: free with 2", papersStatus(on, FREE, 2, "2026-12-10").full, false);
eq("papers: over the limit already (kept, cannot add)", papersStatus(on, FREE, 9, "2026-12-10").full, true);
eq("papers: pro holds 50", papersStatus(on, PRO, 49, "2026-12-10"), { limit: 50, count: 49, full: false });
eq("papers: pro full at 50", papersStatus(on, PRO, 50, "2026-12-10").full, true);
eq("papers: off when its start is empty", papersStatus({ ...on, starts: starts("2026-12-01", ["ai_scans"]) }, FREE, 9, "2026-12-10").limit, null);

// Admin input
const base = { free_ai_scans: 10, free_documents: 2, pro_documents: 100, free_shared_cards: 1, free_trip_papers: 3, pro_trip_papers: 50, free_projects: 2, pro_projects: 50 };
const ok = parseLimits({ ...base, starts: { ai_scans: "2026-12-01", card_sharing: "2026-12-15" } });
eq("parse ok", ok.ok && [ok.value.starts.ai_scans, ok.value.starts.card_sharing, ok.value.starts.documents, ok.value.free_shared_cards, ok.value.pro_trip_papers], ["2026-12-01", "2026-12-15", null, 1, 50]);
eq("no starts means everything off", parseLimits(base).ok && LIMIT_KEYS.every((k) => (parseLimits(base) as { value: Limits }).value.starts[k] === null), true);
eq("empty date means off", (parseLimits({ ...base, starts: { ai_scans: "" } }) as { value: Limits }).value.starts.ai_scans, null);
eq("bad date", parseLimits({ ...base, starts: { trip_papers: "soon" } }).ok, false);
eq("scans not a number", parseLimits({ ...base, free_ai_scans: "ten" }).ok, false);
eq("scans too high", parseLimits({ ...base, free_ai_scans: 5000 }).ok, false);
eq("decimals refused", parseLimits({ ...base, free_ai_scans: 2.5 }).ok, false);
eq("pro below free refused", parseLimits({ ...base, free_documents: 5, pro_documents: 3 }).ok, false);
eq("pro papers below free refused", parseLimits({ ...base, free_trip_papers: 5, pro_trip_papers: 3 }).ok, false);
eq("missing number refused", parseLimits({ ...base, free_documents: undefined }).ok, false);
eq("missing shared cards refused", parseLimits({ ...base, free_shared_cards: "" }).ok, false);
eq("zero free documents is allowed", parseLimits({ ...base, free_ai_scans: 0, free_documents: 0, pro_documents: 10 }).ok, true);
eq("zero shared cards is allowed", parseLimits({ ...base, free_shared_cards: 0 }).ok, true);

// Business projects: active ones only, Free 2, Pro set by the admin
import { projectsStatus } from "../src/lib/limits";
eq("projects: free holds 2", projectsStatus(DEFAULT_LIMITS, FREE, 2, "2026-12-10"), { limit: 2, count: 2, full: true });
eq("projects: free with 1 can add", projectsStatus(DEFAULT_LIMITS, FREE, 1, "2026-12-10").full, false);
eq("projects: pro holds the number set", projectsStatus({ ...DEFAULT_LIMITS, pro_projects: 7 }, PRO, 6, "2026-12-10"), { limit: 7, count: 6, full: false });
eq("projects: pro full at the number", projectsStatus({ ...DEFAULT_LIMITS, pro_projects: 7 }, PRO, 7, "2026-12-10").full, true);
eq("projects: admin never held", projectsStatus(DEFAULT_LIMITS, ADMIN, 99, "2026-12-10").full, false);
eq("projects: admin can switch it off", projectsStatus({ ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, projects: null } }, FREE, 9, "2026-12-10").limit, null);
eq("projects: parse numbers", (parseLimits({ ...base, free_projects: 3, pro_projects: 20 }) as { value: Limits }).value.pro_projects, 20);
eq("projects: pro below free refused", parseLimits({ ...base, free_projects: 5, pro_projects: 3 }).ok, false);
eq("projects: table row", proComparison(DEFAULT_LIMITS).find((r) => r.label === "Active business projects"), { label: "Active business projects", free: "2", pro: "50" });

// Business trip reports: Pro only, from its own start day
const tr = { ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, trip_reports: "2026-12-01" } };
eq("trip reports: free is held back from the day", featureLocked(tr, FREE, "trip_reports", "2026-12-01"), true);
eq("trip reports: before the day nothing changes", featureLocked(tr, FREE, "trip_reports", "2026-11-30"), false);
eq("trip reports: off by default", featureLocked(DEFAULT_LIMITS, FREE, "trip_reports", "2027-01-01"), false);
eq("trip reports: pro and admin keep everything", [featureLocked(tr, PRO, "trip_reports", "2026-12-05"), featureLocked(tr, ADMIN, "trip_reports", "2026-12-05")], [false, false]);
eq("trip reports: parse the start day", (parseLimits({ ...base, starts: { trip_reports: "2026-12-01" } }) as { value: Limits }).value.starts.trip_reports, "2026-12-01");
eq("trip reports: table row", proComparison(tr).find((r) => r.label.startsWith("Trip and project reports")), { label: "Trip and project reports (Excel, PDF)", free: "Receipt photos only", pro: "Yes" });

// Saved settings are never reset by an update
import { mergeLimitsBody } from "../src/lib/limits";
const saved: Limits = { ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, ai_scans: "2026-12-01", projects: "2026-03-01", trip_reports: "2027-01-01" }, free_ai_scans: 7, free_projects: 4, pro_projects: 25 };
const m = (parseLimits(mergeLimitsBody(saved, {})) as { value: Limits }).value;
eq("an empty form keeps every saved setting", m, saved);
const old = (parseLimits(mergeLimitsBody(saved, { free_ai_scans: 9, free_documents: 2, pro_documents: 100, free_shared_cards: 1, free_trip_papers: 3, pro_trip_papers: 50, starts: { ai_scans: "2026-12-05" } })) as { value: Limits }).value;
eq("an old page that does not know a setting keeps it", [old.free_projects, old.pro_projects, old.starts.projects, old.starts.trip_reports], [4, 25, "2026-03-01", "2027-01-01"]);
eq("what the page does send is saved", [old.free_ai_scans, old.starts.ai_scans], [9, "2026-12-05"]);
eq("switching a limit off on purpose still works", (parseLimits(mergeLimitsBody(saved, { starts: { projects: "" } })) as { value: Limits }).value.starts.projects, null);
// A column that does not exist yet (migration not run) keeps its default and does not hide the others
const partial = readLimits({ free_ai_scans: 7, starts_ai_scans: "2026-12-01" });
eq("missing columns keep their defaults", [partial.free_ai_scans, partial.starts.ai_scans, partial.free_projects, partial.starts.projects, partial.starts.trip_reports], [7, "2026-12-01", 2, "2026-01-01", null]);
eq("a column set to empty means off", readLimits({ starts_projects: null }).starts.projects, null);

// Code live before its migration: only the missing column is left out
import { selectLimits } from "../src/lib/limits";
void (async () => {
  const seen: string[] = [];
  const missing = ["starts_trip_reports", "starts_projects"];
  const r = await selectLimits(async (cols) => {
    seen.push(cols);
    const gone = missing.find((m) => cols.split(", ").includes(m));
    if (gone) return { data: null, error: { code: "42703", message: `column pro_limits.${gone} does not exist` } };
    return { data: { starts_ai_scans: "2026-12-01", free_ai_scans: 7 }, error: null };
  });
  eq("two newer columns missing: two retries, the rest still read", [seen.length, r.error, r.data?.free_ai_scans], [3, null, 7]);
  const l = readLimits(r.data);
  eq("saved settings still apply", [l.free_ai_scans, l.starts.ai_scans, l.starts.trip_reports], [7, "2026-12-01", null]);
  const r2 = await selectLimits(async () => ({ data: null, error: { code: "42501", message: "permission denied" } }));
  eq("other errors are returned, not retried", r2.error?.code, "42501");
})();

// Rows from the database
eq("strings from the database", readLimits({ starts_ai_scans: "2026-12-01", free_ai_scans: "7", free_documents: "3", pro_documents: "50", free_trip_papers: "4" }), { ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, ai_scans: "2026-12-01" }, free_ai_scans: 7, free_documents: 3, pro_documents: 50, free_trip_papers: 4 });
eq("a missing row gives the defaults", readLimits(null), DEFAULT_LIMITS);
eq("a junk date is ignored", readLimits({ starts_documents: "soon" }).starts.documents, null);
eq("row round trip", readLimits(limitsRow(on)), on);

// The table on the Get Pro page follows the limits that have a start day
eq("table follows the starts", proComparison({ ...on, starts: starts("2026-12-01", ["ai_scans", "documents"]) }).map((r) => r.label), ["AI receipt scans", "Documents", "Share a reminder with someone", "Photos on a reminder", "Excel and PDF reports"]);
eq("full table", proComparison(on).length, 14);
eq("table numbers", proComparison(on)[0], { label: "AI receipt scans", free: "10 a month", pro: "No limit" });
eq("new rows", proComparison({ ...on, starts: starts("2026-12-01", ["card_sharing", "trip_papers"]) }).slice(0, 2), [{ label: "Shared loyalty cards", free: "1", pro: "No limit" }, { label: "Papers per trip", free: "3", pro: "50" }]);

if (fail) process.exit(1)
eq("reminders: sharing and photos are listed as Pro", proComparison(DEFAULT_LIMITS).filter((r) => /reminder/i.test(r.label)), [{ label: "Share a reminder with someone", free: "No", pro: "Yes" }, { label: "Photos on a reminder", free: "3", pro: "10" }]);
;
