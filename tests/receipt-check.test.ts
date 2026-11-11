import { applyFlags, checkGrocery, crossCheck, diffReadings } from "../src/lib/receipt-check";
import type { GroceryLine } from "../src/lib/personal/grocery";

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};
const L = (name: string, line_total: number, quantity = 1, unit_price = line_total / quantity): GroceryLine => ({ name, quantity, unit_price: Math.round(unit_price * 100) / 100, line_total, category: "Other", unit: null });

// a receipt that adds up
let c = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 3.1), L("Coke", 3.75, 3, 1.25)], total: 9.34 });
eq([c.ok, c.diff, c.issues], [true, 0, []], "items add up to the total");

// tax explains a gap when a subtotal and tax are printed
c = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 3.1)], subtotal: 5.59, tax: 0.34, total: 5.93 });
eq([c.ok, c.diff], [true, 0], "items match the subtotal, subtotal + tax is the total");
c = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 3.1)], total: 5.93 });
eq([c.ok, c.diff], [true, -0.34], "no tax printed: a small gap below the total is taken as tax");

// a misread digit
c = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 8.1)], total: 5.59 });
eq([c.ok, c.diff, c.issues[0]], [false, 5, "The items add up to 10.59, 5.00 more than the receipt total."], "misread price makes the items exceed the total");
eq(Object.keys(c.flagged).length, 0, "no single line equals the gap, so nothing is flagged alone");

// the gap equals one line: counted twice
c = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 3.1), L("Bread", 3.1)], total: 5.59 });
eq([c.ok, c.flagged[1] || c.flagged[2] ? true : false], [false, true], "a gap equal to one price flags that line");

// a missing line
c = checkGrocery({ items: [L("Milk", 2.49)], total: 12.49 });
eq([c.ok, c.issues[0].includes("less than")], [false, true], "far below the total: a line may be missing");

// quantity x price does not match
c = checkGrocery({ items: [{ ...L("Coke", 3.75), quantity: 3, unit_price: 1.5 }], total: 3.75 });
eq([c.ok, Object.keys(c.flagged)], [false, ["0"]], "quantity x price must equal the line amount");

// a better reading scores lower
const bad = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 8.1)], total: 5.59 });
const good = checkGrocery({ items: [L("Milk", 2.49), L("Bread", 3.1)], total: 5.59 });
eq(good.score < bad.score, true, "score is lower for the reading that adds up");

// two readers
const ai = [L("Milk", 2.49), L("Bread", 3.1), L("Eggs", 4.5), L("Rice", 3.0), L("Cheese", 6.4)];
let x = crossCheck(ai, { text: "MILK 2.49\nBREAD 3.10\nEGGS 4.50\nRICE 3.00\nCHEESE 6.40\nTOTAL 19.49", items: [] });
eq([x.trusted, x.agreed, x.flagged], [true, 5, {}], "same prices from both readers: nothing flagged");
x = crossCheck(ai, { text: "MILK 2.49\nBREAD 3.10\nEGGS 4.60\nRICE 3.00\nCHEESE 6.40", items: [] });
eq([x.trusted, Object.keys(x.flagged), (x.flagged[2] || "").includes("4.60"), x.alts], [true, ["2"], true, { 2: 4.6 }], "one price off by a digit is flagged with what the other reader saw, offered as the other price");
x = crossCheck(ai, { text: "MILK 2.49\nBREAD 3.10\nEGGS 4.50\nRICE 3.00", items: [] });
eq([x.trusted, Object.keys(x.flagged)], [true, ["4"]], "a price the good reader cannot find is flagged");
x = crossCheck(ai, { text: "garbled text 2.49", items: [] });
eq([x.trusted, x.flagged], [false, {}], "a poor on-device reading is not used as a witness");
x = crossCheck(ai, { text: "MILK 2.49\nBREAD 3.10\nEGGS 4.50\nRICE 3.00\nCHEESE 6.40", items: [...ai, L("Butter", 5.25)] });
eq(x.extra, [5.25], "a price the AI never listed is reported");
x = crossCheck([L("A", 2.49), L("B", 2.49), L("C", 1.0)], { text: "A 2.49\nC 1.0O\nB 2.49", items: [] });
eq([x.trusted, x.agreed], [true, 3], "the same price twice needs two sightings, and OCR letter slips are repaired first");

const items = [L("Milk", 2.49), L("Bread", 3.1)];
eq([applyFlags(items, { 1: "x" }, {}), items[1].flag, items[0].flag], [1, "x", undefined], "flags land on the right rows");

// second reading compared with the first
const d1 = diffReadings([L("Milk", 2.49), L("Bread", 8.1)], [L("Bread", 3.1), L("Milk", 2.49)]);
eq([d1.alts, Object.keys(d1.flagged), d1.added], [{ 1: 3.1 }, ["1"], 0], "rows matched by name even when the order differs");
const d2 = diffReadings([L("Milk", 2.49), L("Bread", 8.1)], [L("Milk", 2.49), L("Wheat bread", 3.1)]);
eq(d2.alts, { 1: 3.1 }, "a renamed row of the same length is matched by position");
const d3 = diffReadings([L("Milk", 2.49)], [L("Milk", 2.49), L("Butter", 5.25)]);
eq([d3.alts, d3.added], [{}, 1], "a line only the second look found is counted");
