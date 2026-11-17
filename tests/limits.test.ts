import { DEFAULT_LIMITS, LIMIT_KEYS, docStatus, featureLocked, limitOn, limitsActive, limitsRow, nextMonth, papersStatus, parseLimits, proComparison, readLimits, scanStatus, sharingStatus, type LimitKey, type Limits } from "../src/lib/limits";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
const FREE = { pro: false, admin: false }, PRO = { pro: true, admin: false }, ADMIN = { pro: true, admin: true };
const starts = (d: string | null, only?: LimitKey[]) => Object.fromEntries(LIMIT_KEYS.map((k) => [k, !only || only.includes(k) ? d : null])) as Limits["starts"];
const on: Limits = { ...DEFAULT_LIMITS, starts: starts("2026-12-01") };

// Off until the start day
eq("off with no date", limitsActive(DEFAULT_LIMITS, "2026-12-05"), false);
eq("off before the date", limitsActive(on, "2026-11-30"), false);
eq("on from the date", limitsActive(on, "2026-12-01"), true);
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
const base = { free_ai_scans: 10, free_documents: 2, pro_documents: 100, free_shared_cards: 1, free_trip_papers: 3, pro_trip_papers: 50 };
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

// Rows from the database
eq("strings from the database", readLimits({ starts_ai_scans: "2026-12-01", free_ai_scans: "7", free_documents: "3", pro_documents: "50", free_trip_papers: "4" }), { ...DEFAULT_LIMITS, starts: { ...DEFAULT_LIMITS.starts, ai_scans: "2026-12-01" }, free_ai_scans: 7, free_documents: 3, pro_documents: 50, free_trip_papers: 4 });
eq("a missing row gives the defaults", readLimits(null), DEFAULT_LIMITS);
eq("a junk date is ignored", readLimits({ starts_documents: "soon" }).starts.documents, null);
eq("row round trip", readLimits(limitsRow(on)), on);

// The table on the Get Pro page follows the limits that have a start day
eq("table follows the starts", proComparison({ ...on, starts: starts("2026-12-01", ["ai_scans", "documents"]) }).map((r) => r.label), ["AI receipt scans", "Documents", "Excel and PDF reports"]);
eq("full table", proComparison(on).length, 9);
eq("table numbers", proComparison(on)[0], { label: "AI receipt scans", free: "10 a month", pro: "No limit" });
eq("new rows", proComparison({ ...on, starts: starts("2026-12-01", ["card_sharing", "trip_papers"]) }).slice(0, 2), [{ label: "Shared loyalty cards", free: "1", pro: "No limit" }, { label: "Papers per trip", free: "3", pro: "50" }]);

if (fail) process.exit(1);
