import { dollarCall, homeCurrency } from "../src/lib/personal/currency-guess";
import { parseReceiptText } from "../src/lib/ocr";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? "PASS" : "FAIL", msg, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) failed++;
};

eq([homeCurrency("Aruba"), homeCurrency("  aruba "), homeCurrency("Netherlands"), homeCurrency(""), homeCurrency(null)], ["AWG", "AWG", null, null, null], "home currency follows the country");

const base = { bareDollar: true, home: "Aruba", formCurrency: "USD", storeCurrency: null };
eq(dollarCall(base), { kind: "ask", suggest: "AWG" }, "a bare $ in Aruba asks once, suggesting AWG");
eq(dollarCall({ ...base, bareDollar: false }), { kind: "none" }, "a printed code is never questioned");
eq(dollarCall({ ...base, bareDollar: undefined }), { kind: "none" }, "no flag, no question");
eq(dollarCall({ ...base, formCurrency: "AWG" }), { kind: "none" }, "the form is already AWG: the $ is florins, nothing to ask");
eq(dollarCall({ ...base, storeCurrency: "AWG" }), { kind: "apply", currency: "AWG" }, "a store used in AWG before is applied without asking");
eq(dollarCall({ ...base, storeCurrency: "USD" }), { kind: "none" }, "a store used in USD before keeps USD without asking");
eq(dollarCall({ ...base, home: "" }), { kind: "hint" }, "no home place: a hint, no guess");
eq(dollarCall({ ...base, home: "Netherlands" }), { kind: "none" }, "a home country where $ is not florins is left alone");

eq(parseReceiptText("SUPER FOOD\nMILK $3.25\nTOTAL $67.04").bareDollar, true, "on-device reader flags a bare $");
eq(parseReceiptText("SUPER FOOD\nMILK AWG 3.25\nTOTAL AWG 67.04").bareDollar, undefined, "a printed AWG is not a bare $");
eq(parseReceiptText("SHOP\nMILK US$3.25\nTOTAL US$67.04").currency, "USD", "US$ is USD");
eq(parseReceiptText("SHOP\nMILK 3.25\nTOTAL 67.04").bareDollar, undefined, "no sign at all is not a bare $");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
