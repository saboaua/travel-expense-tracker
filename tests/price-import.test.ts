import { mapPriceHeaders, parsePrices, rowsFingerprint, splitFarOff } from "../src/lib/personal/price-import";
import { isConfirmed, productKey, shopperLabel, storeKey } from "../src/lib/personal/community";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// labels under a price
eq("one shopper", shopperLabel(1, false), "Seen by 1 shopper");
eq("two shoppers", shopperLabel(2, false), "Seen by 2 shoppers");
eq("confirmed", shopperLabel(5, true), "Confirmed by 5 shoppers");
eq("three that disagree", shopperLabel(3, false), "3 shoppers, prices differ");
eq("older database: 3 is confirmed", isConfirmed({ reporters: 3 }), true);
eq("older database: 2 is not", isConfirmed({ reporters: 2 }), false);
eq("the database wins", isConfirmed({ reporters: 4, confirmed: false }), false);

// headings
eq("headings found", mapPriceHeaders(["Store", "Product", "Price", "Currency", "Unit"]).missing, []);
eq("other names", mapPriceHeaders(["Shop", "Item", "Unit price", "Curr"]).missing, []);
eq("missing price", mapPriceHeaders(["Store", "Product", "Currency"]).missing, ["Price"]);

const head = ["Store", "Product", "Price", "Currency", "Unit"];
const p = parsePrices(head, [
  ["EXAMPLE Ling & Sons", "Coca-Cola 330 ml can", 1.85, "AWG", null],
  ["Ling & Sons", "Coca-Cola 33CL", "1,85", "awg", null],
  ["LING & SONS SUPERMARKET", "COCA COLA 330ML", 1.9, "AWG", null],
  ["Super Food Plaza", "Tomatoes", 4.95, "AWG", "kg"],
  ["Super Food Plaza", "Milk 1 L", "abc", "AWG", null],
  ["Super Food Plaza", "Milk 1 L", 3.49, "", null],
  ["", "Bread", 2, "AWG", null],
  ["Super Food Plaza", "", 2, "AWG", null],
  [null, null, null, null, null],
]);
if ("error" in p) { fail++; console.error("FAIL parse", p.error); } else {
  eq("rows counted", p.total, 8);
  eq("kept", p.rows.length, 2);
  eq("example skipped", p.skipped.example, 1);
  eq("same row twice", p.skipped.duplicate, 1);
  eq("bad price or currency", p.skipped.badPrice, 2);
  eq("no store or product", p.skipped.missing, 2);
  eq("comma decimal", p.rows[0].price, 1.85);
  eq("currency upper-cased", p.rows[0].currency, "AWG");
  eq("same key as a shopper's receipt", p.rows[0].product_key, productKey({ name: "Coca Cola 330 ml", size: "330 ml", currency: "AWG", unit: null }));
  eq("same store key as the app", p.rows[0].store_key, storeKey("Ling & Sons"));
  eq("size label", p.rows[0].size_label, "330 ml");
  eq("unit kept", p.rows[1].product_key.endsWith("|kg"), true);
}
eq("no price column", "error" in parsePrices(["Store", "Product", "Currency"], []), true);

// far off prices
const row = (price: number, store = "a"): Parameters<typeof rowsFingerprint>[0][number] => ({ store_key: store, store_name: store, product_key: "AWG|milk|1 l|", product_name: "Milk 1 L", size_label: "1 L", currency: "AWG", price });
const far = splitFarOff([row(3.4, "a"), row(3.5, "b"), row(35, "c")], new Map());
eq("typo left out", far.farOff.map((r) => r.price), [35]);
eq("others kept", far.kept.length, 2);
eq("two prices are not judged", splitFarOff([row(3.4), row(35, "b")], new Map()).farOff.length, 0);
eq("judged with what is already shared", splitFarOff([row(35)], new Map([["AWG|milk|1 l|", [3.4, 3.5]]])).farOff.length, 1);

// the same prices give the same fingerprint, however the file is ordered
eq("fingerprint ignores order", rowsFingerprint([row(1, "a"), row(2, "b")]), rowsFingerprint([row(2, "b"), row(1, "a")]));
eq("fingerprint changes with a price", rowsFingerprint([row(1, "a")]) === rowsFingerprint([row(1.01, "a")]), false);

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("PASS price-import");
