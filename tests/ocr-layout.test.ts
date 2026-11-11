import { bestItems, buildRows, layoutText, slimWords, type OcrWord } from "../src/lib/ocr-layout";

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};

// build words for a line: name words from x=20, price right-aligned at x=600; char width 12, height 20
const word = (text: string, x0: number, y: number, conf = 95): OcrWord => ({ text, conf, x0, y0: y, x1: x0 + text.length * 12, y1: y + 20 });
const line = (y: number, name: string, price?: string, conf = 95): OcrWord[] => {
  const out: OcrWord[] = [];
  let x = 20;
  for (const w of name.split(" ").filter(Boolean)) { out.push(word(w, x, y, conf)); x += w.length * 12 + 12; }
  if (price) out.push(word(price, 600 - price.length * 12, y, conf));
  return out;
};

const words = [...line(10, "SUPER FOOD MARKET"), ...line(40, "MILK WHOLE 1L", "2.49"), ...line(70, "BREAD", "3.10"), ...line(100, "TOTAL", "5.59")];
const shuffled = [...words].reverse(); // order must not matter
const rows = buildRows(shuffled);
eq(rows.map((r) => r.text), ["SUPER FOOD MARKET", "MILK WHOLE 1L  2.49", "BREAD  3.10", "TOTAL  5.59"], "rows rebuilt from boxes, wide gap before the price");
eq(rows.map((r) => r.price), [null, "2.49", "3.10", "5.59"], "price is the right-most figure");
eq(rows[1].priceConf, 95, "price confidence comes from the price word");

// a price whose OCR slipped: letters inside it are repaired for the price field
const slip = buildRows(line(10, "RICE", "3.OO"));
eq(slip[0].price, "3.00", "OCR slip repaired in the price");

// small vertical jitter stays on one row; a new row starts a clear step down
const jitter = buildRows([word("MILK", 20, 40), { ...word("2.49", 560, 44), y1: 64 }, word("BREAD", 20, 70), word("3.10", 560, 71)]);
eq(jitter.map((r) => r.text), ["MILK  2.49", "BREAD  3.10"], "slightly uneven words still share a row");

// wrapped name: the name sits alone, the price row has only a size
const wrapped = buildRows([...line(10, "ORGANIC WHOLE MILK"), ...line(40, "1 GAL", "4.99"), ...line(70, "BREAD", "3.10")]);
eq(layoutText(wrapped).split("\n"), ["ORGANIC WHOLE MILK 1 GAL  4.99", "BREAD  3.10"], "a name on one row and size + price on the next become one line");

// weight and quantity lines are left to the parser
const weigh = buildRows([...line(10, "TOMATOES"), ...line(40, "0.750 kg @ 3.99/kg"), ...line(70, "TOMATOES"), ...line(100, "2 x 1.25", "2.50")]);
eq(layoutText(weigh).split("\n").length, 4, "weight and quantity lines are not glued to the name above");

// items and per-row price confidence
const sample = buildRows([...line(10, "SHOP"), ...line(40, "MILK WHOLE", "2.49", 96), ...line(70, "BREAD", "3.10", 52), ...line(100, "TOTAL", "5.59")]);
const items = bestItems("SHOP\nMILK WHOLE 2.49\nBREAD 3.10\nTOTAL 5.59", sample, 5.59);
eq(items.map((i) => [i.name, i.line_total, i.conf]), [["Milk Whole", 2.49, 96], ["Bread", 3.1, 52]], "each item knows how sure the reader was of its price");

// the reading whose items match the total wins
const plain = "SHOP\nMILK WHOLE 8.49\nBREAD 3.10\nTOTAL 5.59"; // plain text has a misread price
const better = buildRows([...line(10, "SHOP"), ...line(40, "MILK WHOLE", "2.49"), ...line(70, "BREAD", "3.10"), ...line(100, "TOTAL", "5.59")]);
eq(bestItems(plain, better, 5.59).map((i) => i.line_total), [2.49, 3.1], "layout reading beats a text reading that does not add up");

eq(slimWords([{ text: " A ", confidence: 90, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, symbols: [1, 2, 3] }, { text: "", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }]), [{ text: "A", conf: 90, x0: 1, y0: 2, x1: 3, y1: 4 }], "raw words reduced to what is needed");
