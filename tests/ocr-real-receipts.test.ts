import fs from "fs";
import { parseReceiptText } from "../src/lib/ocr";
import { parseLineItems } from "../src/lib/personal/grocery";
import { cleanOcrText } from "../src/lib/ocr-clean";

// Raw Tesseract output from six real Aruban receipts (Nature's Discount, Folira x2, Ling & Sons, New Hua Run, Heng Sheng)
const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};
const fx = (n: number) => fs.readFileSync(`tests/fixtures/aruba-receipt-${n}.txt`, "utf8");
const NOW = new Date("2026-11-11T15:30:00-04:00");
const parse = (n: number) => parseReceiptText(fx(n), { currency: "AWG" }, NOW);
const rows = (n: number) => parseLineItems(fx(n)).map((i) => [i.name, i.quantity, i.unit_price, i.line_total]);

// dates: the same town prints day-first and month-first; the reading nearest today wins
eq(parse(1).date, "2026-11-04", "04/11/2026 is 4 November, not 11 April");
eq(parse(2).date, "2026-11-05", "11/5/2026 is 5 November");
eq(parse(3).date, "2026-11-04", "11/4/2026");
eq(parse(4).date, "2026-11-11", "11/11/2026");
eq(parseReceiptText("Date: 03/04/2026", { currency: "AWG" }, new Date("2026-04-20")).date, "2026-04-03", "never in the future");

// florin prefix
eq(cleanOcrText("041000047008  F 1.50  F 3.00"), "041000047008  1.50  3.00", "F prefix removed");
eq(cleanOcrText("VITAMIN F 3"), "VITAMIN F 3", "a letter F in a name stays");

// totals
eq(parse(3).amount, 14.13, "AWG total, not the dollar-equivalent line");
eq(parse(4).amount, 13.04, "total");
eq(parse(2).amount, 17.75, "cash receipt without a total line: tendered less change");
eq(parse(5).amount, 35.9, "tendered");

// merchants
eq(parse(2).merchant, "FOLIRA Supermarket", "not 'Cash Purchase'");
eq(parse(5).merchant, "FOLIRA Supermarket", "not 'Cash Purchase'");

// line items
eq(rows(1)[0], ["Vitamin B-Complex 50Ma 100Caps", 1, 38.79, 38.79], "coded description + EACH line");
eq(rows(1)[1]?.[3], 43.15, "total worked out from unit price and discount");
eq(parseLineItems(fx(1))[1]?.flag != null, true, "a worked-out price is flagged");
eq(rows(2).map((r) => r[3]), [3.25, 3], "Folira: name line + barcode line (the unreadable first item is skipped)");
eq(rows(2)[1], ["Ore", 2, 1.5, 3], "quantity 2 from the figures");
eq(rows(3), [["Gouda Jong Kaas", 0.1581, 36.88, 5.83], ["Hdk Fit Vegan Brood X4", 1, 8.3, 8.3]], "Ling: weighed cheese + bread");
eq(rows(4).map((r) => r[3]), [7.15, 5.89], "Hua Run columns");
eq(rows(5).map((r) => r[3]), [11.5, 12.5], "Folira second receipt (third line is unreadable in the photo text)");
eq(rows(6).map((r) => r[3]), [6.25], "Heng Sheng");
