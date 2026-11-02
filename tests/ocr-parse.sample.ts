// Prints parsed fields for sample receipts. Run with: npx tsx tests/ocr-parse.sample.ts
import { parseReceiptText, normalizeNumber } from "../src/lib/ocr";

const now = new Date();
const y = now.getUTCFullYear();
const cases: [string, string, any][] = [
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
for (const [name, text, hints] of cases) {
  const r = parseReceiptText(text, hints);
  console.log(name, JSON.stringify({m:r.merchant,a:r.amount,c:r.currency,d:r.date,cat:r.category}));
}
console.log(normalizeNumber("1.234,50"), normalizeNumber("1,234.50"), normalizeNumber("45,20"), normalizeNumber("12.5"));
