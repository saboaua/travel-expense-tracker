import { looksLikePaymentCard, parseCardText, sanitizeCardRead, isEmptyRead } from "../src/lib/loyalty-read";

let failed = 0;
const eq = (got: unknown, want: unknown, msg: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { failed++; console.log(`FAIL ${msg}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } else console.log(`PASS ${msg}`); };

eq(sanitizeCardRead({ store: " Sunrise  Pharmacy ", category: "care card", holder: "Pat Example", number: "7700 1234 5566", format: "code128" }),
  { store: "Sunrise Pharmacy", category: "Care card", holder: "Pat Example", number: "770012345566", format: "CODE128" }, "a good answer is cleaned");
eq(isEmptyRead(sanitizeCardRead({ store: "Bank", number: "4111 1111 1111 1111", is_payment_card: true })), true, "a payment card is never read");
eq(sanitizeCardRead({ store: "Shop", number: "4111 1111 1111 1111" }).number, null, "a bank-card number is dropped even if not flagged");
eq(looksLikePaymentCard("4111111111111111"), true, "Luhn-valid Visa number is a payment card");
eq(looksLikePaymentCard("770012345566"), false, "a 12-digit member number is not");
eq(sanitizeCardRead({ store: "Shop", category: "Spaceships", holder: "R2D2", number: "12" }), { store: "Shop", category: null, holder: null, number: null, format: null }, "unknown type, digits in a name and a too-short number are dropped");
eq(sanitizeCardRead({ store: "Shop", number: "https://x.example/c/1", format: "bogus" }).format, "QR", "a bad format falls back to detection");
eq(isEmptyRead(sanitizeCardRead({})), true, "empty answer is empty");
const p = parseCardText("Sunrise Pharmacy\nMember\nName: Pat Example\n7700 1234 5566\nValid 12/29");
eq([p.store, p.holder, p.number], ["Sunrise Pharmacy", "Pat Example", "770012345566"], "basic text is parsed");
eq(parseCardText("4111 1111 1111 1111").number, null, "basic parser skips bank-card numbers");
if (failed) { console.log(`${failed} failed`); process.exit(1); }
