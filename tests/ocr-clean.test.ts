import { cleanOcrText, fixDigits } from "../src/lib/ocr-clean";
import { parseLineItems } from "../src/lib/personal/grocery";
import { parseReceiptText } from "../src/lib/ocr";

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};
const rows = (t: string) => parseLineItems(t).map((i) => [i.name, i.quantity, i.line_total]);

// text clean-up
eq(fixDigits("MILK 2.4S"), "MILK 2.45", "S read for 5");
eq(fixDigits("RICE l.89 and 3.OO"), "RICE 1.89 and 3.00", "l and O read for 1 and 0");
eq(fixDigits("SOS.OO"), "SOS.OO", "a word is left alone");
eq(cleanOcrText("MILK  2 .49"), "MILK  2.49", "space before the decimals");
eq(cleanOcrText("BREAD 3. 10"), "BREAD 3.10", "space after the separator");
eq(cleanOcrText("MILK  $2.49"), "MILK  2.49", "dollar sign removed");
eq(cleanOcrText("MILK  AWG 2.49"), "MILK  2.49", "currency code removed");
eq(cleanOcrText("COUPON 1.00-"), "COUPON -1.00", "trailing minus moves to the front");
eq(cleanOcrText("MILK ........ 2.49"), "MILK  2.49", "dot leaders removed");

// line items from noisy OCR text
eq(rows("SHOP\nMILK WHOLE  $2.49\nBREAD  $3.10\nTOTAL $5.59"), [["Milk Whole", 1, 2.49], ["Bread", 1, 3.1]], "dollar prices");
eq(rows("SHOP\nMILK WHOLE  2 .49\nBREAD  3. 10\nTOTAL 5.59"), [["Milk Whole", 1, 2.49], ["Bread", 1, 3.1]], "spaced decimals");
eq(rows("SHOP\nMILK WHOLE  2.4S\nBREAD  l.89\nRICE  3.OO\nTOTAL 7.34"), [["Milk Whole", 1, 2.45], ["Bread", 1, 1.89], ["Rice", 1, 3]], "letters read as digits");
eq(rows("SHOP\nMILK  2.49\nCOUPON  1.00-\nBREAD 3.10\nTOTAL 4.59"), [["Milk", 1, 2.49], ["Bread", 1, 3.1]], "a discount line is not a product");
eq(rows("SHOP\nCOKE 330ML\n  3 X 1.25     3.75\nBREAD 3.10\nTOTAL 6.85"), [["Coke 330ML", 3, 3.75], ["Bread", 1, 3.1]], "quantity on the line below the name");
eq(rows("SHOP\nCOKE 3.75\n3 x 1.25\nBREAD 3.10\nTOTAL 6.85"), [["Coke", 3, 3.75], ["Bread", 1, 3.1]], "quantity under a priced line");
eq(rows("SHOP\nMILK WHOLE ........ 2.49\nBREAD ........ 3.10\nTOTAL 5.59"), [["Milk Whole", 1, 2.49], ["Bread", 1, 3.1]], "dot leaders");
eq(rows("SHOP\n0012345 MILK WHOLE 1L   2.49\n0012399 BREAD   3.10\nTOTAL 5.59"), [["Milk Whole 1L", 1, 2.49], ["Bread", 1, 3.1]], "product code before the name");
eq(rows("SHOP\nSTORE BRAND MILK  2.49\nCARD HOLDER NAPKINS  2.00\nTOTAL 4.49"), [["Store Brand Milk", 1, 2.49], ["Card Holder Napkins", 1, 2]], "products that start with store or card");
eq(rows("SHOP\nMILK 2.49\nSTORE 0042\nVISA **** 1234  2.49\nCARD PAYMENT 2.49"), [["Milk", 1, 2.49]], "payment and store lines stay out");
eq(rows("SHOP\nTV STAND  1.299,00\nTOTAL 1.299,00"), [["Tv Stand", 1, 1299]], "thousands separator");

// totals read from the same noisy text
eq(parseReceiptText("SHOP\nMILK $2.49\nTOTAL $5.59").amount, 5.59, "total with dollar sign");
eq(parseReceiptText("SHOP\nMILK 2.49\nTOTAL 1O.O9").amount, 10.09, "total with letters for zeros");
