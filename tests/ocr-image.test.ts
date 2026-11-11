import { adaptiveBinarize, grayToRgba, ocrScale, stretchContrast, toGray } from "../src/lib/ocr-image";
import { parseModelJson } from "../src/lib/ocr-ai";
import { scoreOcr } from "../src/lib/ocr";

const eq = (a: unknown, b: unknown, m: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? "PASS" : "FAIL", m, ok ? "" : `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  if (!ok) process.exitCode = 1;
};

eq(Array.from(toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))), [255, 0], "grey of white and black");
eq(Array.from(grayToRgba(new Uint8ClampedArray([7]))), [7, 7, 7, 255], "grey back to RGBA");

// a dim, low-contrast strip is stretched to the full range
const dim = new Uint8ClampedArray(100).map((_, i) => 100 + (i % 10) * 4);
const st = stretchContrast(dim);
eq([Math.min(...st) <= 5, Math.max(...st) >= 250], [true, true], "contrast stretch reaches black and white");

// text in a shadow: dark ink on a gradient background that goes from bright to dark
const w = 120, h = 40;
const g = new Uint8ClampedArray(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const paper = 230 - x * 1.4; // 230 on the left, 62 on the right
  const ink = y % 8 < 2 && x % 6 < 4; // thin stripes standing in for text
  g[y * w + x] = ink ? paper * 0.55 : paper;
}
const bin = adaptiveBinarize(g, w, h, { window: 31 });
let inkRight = 0, inkTotalRight = 0, paperWhiteRight = 0, paperTotalRight = 0;
for (let y = 0; y < h; y++) for (let x = 90; x < w; x++) {
  const ink = y % 8 < 2 && x % 6 < 4;
  if (ink) { inkTotalRight++; if (bin[y * w + x] === 0) inkRight++; } else { paperTotalRight++; if (bin[y * w + x] === 255) paperWhiteRight++; }
}
eq([inkRight / inkTotalRight > 0.9, paperWhiteRight / paperTotalRight > 0.9], [true, true], "ink stays black and paper white inside a dark shadow");
const flat = adaptiveBinarize(new Uint8ClampedArray(w * h).fill(200), w, h);
eq(Array.from(new Set(flat)), [255], "a blank page stays white");

// scaling
eq(ocrScale(1600, 1200) === 1, true, "mid-size photo kept");
eq(ocrScale(800, 600) > 2, true, "small photo enlarged");
eq(ocrScale(4000, 3000) < 1, true, "huge photo shrunk");
eq(ocrScale(600, 2400) >= 1.5, true, "narrow tall slip gets enough width");
eq(ocrScale(5000, 5000) * 5000 * ocrScale(5000, 5000) * 5000 <= 6_000_001, true, "never above 6 million pixels");

// model JSON, also when the answer was cut off
eq(parseModelJson('{"a":1}'), { a: 1 }, "plain json");
eq(parseModelJson('```json\n{"a":1}\n```'), { a: 1 }, "fenced json");
eq(parseModelJson('{"store":"X","total":5,"items":[{"name":"A","line_total":1},{"name":"B","line_total":2},{"name":"C","line_tot'), { store: "X", total: 5, items: [{ name: "A", line_total: 1 }, { name: "B", line_total: 2 }] }, "cut off in the middle of an item keeps the complete ones");
eq(parseModelJson("no json here"), null, "no json");

// scoring prefers the reading that still has prices
const withPrices = "SHOP\nMILK 2.49\nBREAD 3.10\nTOTAL 5.59\n03/11/2026";
const noPrices = "SHOP\nMILK\nBREAD\nTOTAL";
eq(scoreOcr(withPrices, 80) > scoreOcr(noPrices, 92), true, "a reading with prices beats a more confident one without");
