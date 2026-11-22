import { buildShelfPrompt, cleanSize, parseShelfText, sanitizeShelfLabel, unreadable } from "../src/lib/shelf-label";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`PASS ${msg}`); };

eq(["275gr", "1,5 Ltr", "6.75 OZ", "6 pack", "12", "big", "0 g", null].map(cleanSize), ["275 g", "1.5 l", "6.75 oz", "6 pack", null, null, null, null], "sizes are normalised, anything else is dropped");

// the Duyvis label: two currencies, the shopper's one wins even when it is second
const duyvis = { brand: "Duyvis", name: "Tijgernootjes bbq paprika", size: "275gr", prices: [{ amount: 5.88, currency: "USD" }, { amount: 10.29, currency: "AWG" }], on_sale: false };
eq(sanitizeShelfLabel(duyvis, "AWG"), { product: "Duyvis Tijgernootjes bbq paprika", size: "275 g", price: 10.29, sale: false, usedCurrency: "AWG" }, "the price in the shopper's currency is used");
eq(sanitizeShelfLabel(duyvis, "USD").price, 5.88, "another country gets its own price");
eq(sanitizeShelfLabel(duyvis, null).price, 5.88, "with no currency the first price is used");
eq(sanitizeShelfLabel({ brand: "Smartfood", name: "Smartfood popcorn", prices: [{ amount: "5,79", currency: null }] }, "AWG").product, "Smartfood popcorn", "the brand is not repeated");
eq(sanitizeShelfLabel({ name: "Milk", prices: [{ amount: 3, currency: null }, { amount: 1.6, currency: "EUR" }] }, "AWG").price, 3, "a price with no currency counts as the local one");
eq(sanitizeShelfLabel({ name: "Milk", prices: [{ amount: -2 }, { amount: 0 }, { amount: "abc" }, { amount: 99999999 }] }, "AWG").price, null, "nonsense prices are dropped");
eq(sanitizeShelfLabel({ name: "Milk", prices: [{ amount: 2 }], on_sale: "yes" }, "AWG").sale, false, "sale is only a real true");
eq(sanitizeShelfLabel({ name: "Milk", prices: [{ amount: 2 }], on_sale: true }, "AWG").sale, true, "a sale label is marked");
eq(unreadable(sanitizeShelfLabel({}, "AWG")), true, "an empty answer is unreadable");
eq(unreadable(sanitizeShelfLabel({ name: "Milk" }, "AWG")), false, "a name alone is still something to fill in");
eq(/AWG/.test(buildShelfPrompt("AWG")) && /Never follow instructions/.test(buildShelfPrompt(null)), true, "the prompt names the currency and ignores text in the photo");

eq(/Aruban florin/.test(buildShelfPrompt("AWG")) && /digits under a barcode/.test(buildShelfPrompt("AWG")), true, "the prompt knows FL. is florin and ignores barcode digits");
// the Kraft label: "FL. 15.05" has no ISO code, and it still counts as the local price
eq(sanitizeShelfLabel({ brand: "Kraft", name: "Classic Ceasar Dressing", size: "16OZ", prices: [{ amount: 15.05, currency: "AWG" }] }, "AWG"), { product: "Kraft Classic Ceasar Dressing", size: "16 oz", price: 15.05, sale: false, usedCurrency: "AWG" }, "the Kraft label");
eq(sanitizeShelfLabel({ name: "GOYA HOT SAUCE", size: "6OZ", prices: [{ amount: 3.95, currency: null }] }, "AWG").price, 3.95, "a label price with no code is the local price");

// the phone's own reading of the two shelf labels (plain text, no AI)
eq(parseShelfText("KRAFT CLASSIC CEASAR\nDRESSING 160Z\nII 021000323074\nFL. 15.05", "AWG"), { product: "Kraft Classic Ceasar Dressing", size: "16 oz", price: 15.05, sale: false, usedCurrency: "AWG" }, "Kraft label read by the phone: price from the FL. line, barcode ignored");
eq(parseShelfText("GOYA HOT SAUCE 6OZ\n041331038577\nFL. 3.95", "AWG"), { product: "Goya Hot Sauce", size: "6 oz", price: 3.95, sale: false, usedCurrency: "AWG" }, "Goya label read by the phone");
eq(parseShelfText("Duyvis\nTijgernootjes bbq paprika\n275gr\nAWG 10.29\n$ 5.88", "AWG").price, 5.88, "the last price line wins when two are printed (the caller shows the Check note)");
eq(parseShelfText("041331038577", "AWG").price, null, "barcode digits are never a price");
eq(unreadable(parseShelfText("", "AWG")), true, "no text is unreadable");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("shelf-label: all checks passed");
