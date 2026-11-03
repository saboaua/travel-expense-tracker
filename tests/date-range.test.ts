// Run with: npx tsx tests/date-range.test.ts
import { formatDateRange, formatDayHeading } from "../src/lib/utils";
let failed = 0;
const eq = (a: unknown, b: unknown, m: string) => { const ok = a === b; console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${a} want ${b}`); if (!ok) failed++; };
eq(formatDateRange("2026-11-17", "2026-11-20"), "Nov 17\u201320", "same month");
eq(formatDateRange("2026-11-28", "2026-12-02"), "Nov 28 \u2013 Dec 2", "across months");
eq(formatDateRange("2026-12-30", "2027-01-02"), "Dec 30, 2026 \u2013 Jan 2, 2027", "across years");
eq(formatDateRange("2026-11-17", null), "Nov 17", "no end date");
eq(formatDateRange("2026-11-17", "2026-11-17"), "Nov 17", "single day");
eq(formatDayHeading("2026-11-03", "2026-11-03"), "Today", "heading today");
eq(formatDayHeading("2026-11-02", "2026-11-03"), "Yesterday", "heading yesterday");
eq(formatDayHeading("2026-10-31", "2026-11-01"), "Yesterday", "yesterday across month end");
eq(formatDayHeading("2026-10-14", "2026-11-03"), "Wed, Oct 14", "heading older date");
process.exit(failed ? 1 : 0);
