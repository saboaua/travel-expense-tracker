import { isOwnReceiptPath } from "../src/lib/receipt-path";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (a !== b) { fail++; console.error(`FAIL ${m}: got ${a}, want ${b}`); } };
const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

eq("own file", isOwnReceiptPath(`${me}/trip/1700000000.jpg`, me), true);
eq("own nested file", isOwnReceiptPath(`${me}/personal/p1/17.png`, me), true);
eq("someone else's file", isOwnReceiptPath(`${other}/trip/1.jpg`, me), false);
eq("climbing out of own folder", isOwnReceiptPath(`${me}/../${other}/trip/1.jpg`, me), false);
eq("dot segment", isOwnReceiptPath(`${me}/./1.jpg`, me), false);
eq("empty segment", isOwnReceiptPath(`${me}//1.jpg`, me), false);
eq("backslash", isOwnReceiptPath(`${me}/a\\..\\b.jpg`, me), false);
eq("folder prefix only partially matching", isOwnReceiptPath(`${me}x/1.jpg`, me), false);
eq("just the id", isOwnReceiptPath(me, me), false);
eq("not a string", isOwnReceiptPath(null, me), false);
eq("no user", isOwnReceiptPath(`${me}/1.jpg`, ""), false);
eq("very long", isOwnReceiptPath(`${me}/${"a".repeat(400)}`, me), false);

if (fail) process.exit(1);
console.log("receipt path checks passed");
