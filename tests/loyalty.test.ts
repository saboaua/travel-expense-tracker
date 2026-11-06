// Run with: npx tsx tests/loyalty.test.ts
import { cleanNumber, detectFormat, displayNumber, filterCards, formatProblem, gtinCheckDigit, colorForName, CARD_COLORS, type LoyaltyCard } from "../src/lib/loyalty";
import { targetSize } from "../src/lib/loyalty-image";
const eq = (a: unknown, b: unknown, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); if (!ok) process.exitCode = 1; };

// check digits (4006381333931 is a real EAN-13 example, 036000291452 a real UPC-A)
eq(gtinCheckDigit("400638133393"), 1, "EAN-13 check digit");
eq(gtinCheckDigit("03600029145"), 2, "UPC-A check digit");

eq(detectFormat("4006381333931"), "EAN13", "13 valid digits -> EAN-13");
eq(detectFormat("036000291452"), "UPCA", "12 valid digits -> UPC-A");
eq(detectFormat("4006381333932"), "CODE128", "13 digits with a wrong check digit -> CODE128");
eq(detectFormat("4021 8830 1177"), "CODE128", "membership number -> CODE128");
eq(detectFormat("4006 3813 3393 1"), "EAN13", "spaces are ignored");
eq(detectFormat("https://shop.example/card/123"), "QR", "link -> QR");
eq(detectFormat("Müller Karte"), "QR", "non-ASCII -> QR");
eq(detectFormat("x".repeat(60)), "QR", "very long -> QR");
eq(detectFormat(""), "CODE128", "empty -> default");

eq(cleanNumber(" 4021 8830-1177 "), "402188301177", "spaces and dashes removed");
eq(cleanNumber(" https://a.b/c d ", "QR"), "https://a.b/c d", "QR keeps the text");

eq(formatProblem("", "CODE128"), "Enter the card or barcode number.", "empty number");
eq(formatProblem("402188301177", "CODE128"), null, "CODE128 digits ok");
eq(formatProblem("4006381333931", "EAN13"), null, "valid EAN-13");
eq(formatProblem("4006381333932", "EAN13")?.startsWith("EAN-13 needs 13 digits"), true, "bad EAN-13");
eq(formatProblem("123", "UPCA")?.startsWith("UPC-A needs 12 digits"), true, "bad UPC-A");
eq(formatProblem("Müller", "CODE128")?.includes("QR"), true, "CODE128 rejects non-ASCII");
eq(formatProblem("x".repeat(81), "CODE128")?.includes("too long"), true, "CODE128 too long");
eq(formatProblem("anything at all é", "QR"), null, "QR takes any text");

eq(displayNumber("402188301177"), "4021 8830 1177", "digits grouped");
eq(displayNumber("AB-12"), "AB-12", "short codes untouched");

eq(colorForName("Greenfield Market"), colorForName(" greenfield market "), "colour is stable per name");
eq(CARD_COLORS.includes(colorForName("Anything")), true, "colour comes from the palette");

eq(targetSize(4000, 3000), { width: 800, height: 600 }, "landscape photo shrunk to 800 px");
eq(targetSize(3000, 4000), { width: 600, height: 800 }, "portrait photo shrunk to 800 px");
eq(targetSize(500, 300), { width: 500, height: 300 }, "small photo is never enlarged");
eq(targetSize(800, 800), { width: 800, height: 800 }, "exactly 800 stays");

const card = (store_name: string, category: string | null, holder_name: string | null = null): LoyaltyCard => ({ id: store_name, user_id: "u", store_name, holder_name, category, card_number: "1", barcode_format: "CODE128", color: null, image_path: null, created_at: "" });
const all = [card("Greenfield Market", "Rewards"), card("Brew & Bean", "Coffee club"), card("Sol Pharmacy", "Care card", "Patrick")];
eq(filterCards(all, "").length, 3, "no search shows all");
eq(filterCards(all, "BREW").map((c) => c.store_name), ["Brew & Bean"], "search by store, any case");
eq(filterCards(all, "coffee").length, 1, "search by category");
eq(filterCards(all, "patrick").length, 1, "search by holder");
eq(filterCards(all, "zzz").length, 0, "no match");
