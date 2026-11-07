import { maskNumber, maskAuditDetails, maskAuditRows } from "../src/lib/audit-privacy";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

eq("example from the request", maskNumber(5.45), "*.*5");
eq("string amount", maskNumber("5.45"), "*.*5");
eq("thousands", maskNumber("1,234.50"), "*,***.*0");
eq("whole number", maskNumber(120), "**0");
eq("one digit stays (nothing else to hide)", maskNumber(5), "5");
eq("no digits", maskNumber("n/a"), "n/a");
eq("negative", maskNumber(-12.5), "-**.5");

const d = maskAuditDetails({ merchant: "Uber", amount: 5.45, currency: "USD", amount_usd: 5.45, category: "Transport", trip_id: "7d1c6a1e-3b7f-4d6a-9d52-0f4a3a1b2c3d", notes: "Lunch 12.50" });
eq("merchant and currency untouched", [d.merchant, d.currency, d.category], ["Uber", "USD", "Transport"]);
eq("amounts masked", [d.amount, d.amount_usd], ["*.*5", "*.*5"]);
eq("ids and free text untouched", [d.trip_id, d.notes], ["7d1c6a1e-3b7f-4d6a-9d52-0f4a3a1b2c3d", "Lunch 12.50"]);

const nested = maskAuditDetails({ before: { total: 100.5, name: "x" }, after: [{ price: "9.99" }] });
eq("nested objects and lists", nested, { before: { total: "***.5", name: "x" }, after: [{ price: "*.*9" }] });
eq("null and empty are safe", [maskAuditDetails(null), maskAuditDetails({}), maskAuditDetails({ amount: null })], [null, {}, { amount: null }]);

const original = { id: "1", details: { amount: 5.45 } };
const rows = maskAuditRows<{ id: string; details?: { amount?: number } }>([original, { id: "2" }]);
eq("rows masked, input not changed", [rows[0].details, original.details.amount, rows[1].details], [{ amount: "*.*5" }, 5.45, {}]);

if (fail) process.exit(1);
console.log("audit-privacy: all checks passed");
