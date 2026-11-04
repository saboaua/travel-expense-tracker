// Receipt text parsing: merchant, total, currency, date and category from sample OCR output.
import { parseReceiptText, normalizeNumber } from "../src/lib/ocr";

const now = new Date();
const y = now.getUTCFullYear() - 1; // last year: always in the past, always within the 5-year window
type Hints = Parameters<typeof parseReceiptText>[1];
const cases: [string, string, Hints][] = [
 ["restaurant", `GRILL HOUSE
123 Main Street
Tel 555-1234
Date: 10/14/${y}
Burger            12.50
Fries              4.00
Subtotal          16.50
Tax                1.32
Tip                3.00
TOTAL             20.82
VISA ****1234
Change             0.00`, {currency:"USD", categories:["Meals","Transport","Lodging","Fuel","Other"]}],
 ["ocr digit errors + european", `HOTEL PLAZA
Check-in 12 Oct ${y}
Room charge 1.234,50
VAT 9% 111,10
TOTAL EUR 1.34S,60`, {currency:"EUR", categories:["Meals","Lodging"]}],
 ["total on next line", `Shell Gas Station
${y}-10-20
Unleaded 12.4 gallons
TOTAL
45.20
CASH 50.00
CHANGE 4.80`, {currency:"USD"}],
 ["dd/mm ambiguous non-US", `SUPERMARKET
03/04/${y}
Total Afl. 87.25`, {currency:"AWG"}],
 ["no keywords", `Some Cafe
${y}-09-02
Latte 4.50
Cake 6.00
10.50`, {}],
];
const expected: Record<string, { m: string; a: number; c: string | null; d: string; cat: string | null }> = {
  "restaurant": { m: "GRILL HOUSE", a: 20.82, c: null, d: `${y}-10-14`, cat: "Meals" },
  "ocr digit errors + european": { m: "HOTEL PLAZA", a: 1345.6, c: "EUR", d: `${y}-10-12`, cat: "Lodging" },
  "total on next line": { m: "Shell Gas Station", a: 45.2, c: null, d: `${y}-10-20`, cat: "Fuel" },
  "dd/mm ambiguous non-US": { m: "SUPERMARKET", a: 87.25, c: "AWG", d: `${y}-04-03`, cat: null },
  "no keywords": { m: "Some Cafe", a: 10.5, c: null, d: `${y}-09-02`, cat: "Meals" },
};
let fail = 0;
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };
for (const [name, text, hints] of cases) {
  const r = parseReceiptText(text, hints);
  eq(name, { m: r.merchant, a: r.amount, c: r.currency, d: r.date, cat: r.category }, expected[name]);
}
eq("normalizeNumber", [normalizeNumber("1.234,50"), normalizeNumber("1,234.50"), normalizeNumber("45,20"), normalizeNumber("12.5")], [1234.5, 1234.5, 45.2, 12.5]);
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
