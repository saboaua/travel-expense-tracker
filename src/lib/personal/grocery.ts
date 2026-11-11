/**
 * Pure grocery helpers: item-name normalisation, receipt line-item parsing (offline fallback),
 * price statistics and monthly summaries. No I/O so everything here is unit-testable.
 */

import { cleanOcrText } from "@/lib/ocr-clean";

/* ---------------- item name normalisation ---------------- */

const SIZE_TOKENS = /\b\d+(?:[.,]\d+)?\s?(?:kg|kgs|g|gr|gm|lb|lbs|oz|l|lt|ltr|ml|cl|ct|pk|pkt|pack|pcs|pc|each|ea|dz|doz)\b/g;
const STOP_WORDS = new Set(["the", "of", "a", "an", "and", "with", "fresh", "new", "pk", "pack", "kg", "kgs", "lb", "lbs", "awg", "usd", "eur", "ang", "for", "per", "st", "stuk"]);
const ABBREVIATIONS: Record<string, string> = { org: "organic", chkn: "chicken", chk: "chicken", bnls: "boneless", whl: "whole", ff: "fat free", sk: "skim" };
const KEEP_S = /(ss|us|is)$/;

function singular(word: string): string {
  if (word.length <= 3 || KEEP_S.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** "ORG BANANAS 1KG" -> "banana organic"; "Bananas" -> "banana". Words are sorted for stable matching. */
export function normalizeItemName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SIZE_TOKENS, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+\b/g, " ");

  const words = base
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(singular);

  // Sorted so word order never splits a product ("whole milk" == "milk whole")
  const out = [...words].sort().join(" ").trim();
  return out || name.trim().toLowerCase();
}

/* ---------------- category guess ---------------- */

const GROCERY_RULES: [string, RegExp][] = [
  ["Produce", /\b(banana|apple|orange|lemon|lime|grape|berry|berries|strawberr|avocado|tomato|potato|onion|garlic|lettuce|spinach|kale|cabbage|carrot|cucumber|pepper|broccoli|cauliflower|mango|pineapple|melon|papaya|herb|cilantro|parsley|produce|vegetable|fruit|salad)\w*\b/i],
  ["Meat & Seafood", /\b(kip|vlees|vis|chicken|beef|pork|steak|bacon|sausage|ham|turkey|lamb|fish|salmon|tuna|shrimp|prawn|seafood|mince|ground\s+beef|ribs|fillet|meat)\b/i],
  ["Dairy & Eggs", /\b(kaas|melk|ei|eieren|boter|milk|cheese|gouda|muenster|edam|yogurt|yoghurt|butter|cream|egg|eggs|margarine|cheddar|mozzarella|dairy)\b/i],
  ["Bakery", /\b(brood|bread|bun|buns|bagel|croissant|tortilla|cake|muffin|baguette|roll|rolls|bakery|pastry|donut)\b/i],
  ["Frozen", /\b(frozen|ice\s*cream|pizza|fries|popsicle|gelato)\b/i],
  ["Beverages", /\b(water|juice|soda|cola|coke|pepsi|sprite|beer|wine|rum|vodka|whisky|coffee|tea|drink|energy|lemonade|smoothie)\b/i],
  ["Snacks", /\b(chips|cracker|cookie|cookies|candy|chocolate|snack|popcorn|nuts|pretzel|biscuit|granola|bar)\b/i],
  ["Household", /\b(detergent|soap|bleach|cleaner|tissue|toilet|paper\s*towel|foil|trash|garbage|bag|sponge|dish|laundry|napkin|battery|light\s*bulb)\b/i],
  ["Personal Care", /\b(shampoo|conditioner|toothpaste|toothbrush|deodorant|lotion|razor|sunscreen|shaving|diaper|wipes|tampon|pad|vitamin|medicine)\b/i],
  ["Pantry", /\b(rice|pasta|spaghetti|noodle|flour|sugar|salt|oil|vinegar|sauce|ketchup|mayo|mustard|cereal|oats|beans|lentil|canned|can|soup|honey|jam|peanut\s*butter|spice|seasoning|stock|broth|corn)\b/i],
];

export function guessGroceryCategory(name: string): string {
  const normalized = normalizeItemName(name); // expands abbreviations such as CHKN -> chicken
  for (const [cat, re] of GROCERY_RULES) if (re.test(name) || re.test(normalized)) return cat;
  return "Other";
}

/* ---------------- line item parser (offline fallback) ---------------- */

export type GroceryLine = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  category: string;
  /** "kg" / "lb" / ... when quantity is a weight; null for counted items. */
  unit?: string | null;
};

/* ---------------- receipt name clean-up and weight lines ---------------- */

const CURRENCY_OR_UNIT_TAIL = /(?:\s+(?:kg|kgs|lb|lbs|awg|usd|eur|ang|cur|st))+\s*$/i;

/** "MUENSTER JALAPENO YEL KG AWG" -> "Muenster Jalapeno Yel". Shouting names become Title Case. */
export function cleanReceiptItemName(name: string): string {
  let out = name.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3 && CURRENCY_OR_UNIT_TAIL.test(out); i++) out = out.replace(CURRENCY_OR_UNIT_TAIL, "").trim();
  const letters = out.replace(/[^A-Za-z]/g, "");
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    out = out
      .split(" ")
      .map((w) => (/\d/.test(w) ? w : w.toLowerCase().replace(/(^|[/(-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())))
      .join(" ");
  }
  return out;
}

const WEIGHT_AT_START = /^(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs|g|gr|oz)\b/i;

/** A printed weight line such as "0.1219 kg for AWG 36.60/kg" or "0.750 kg @ 3.99/kg". */
export function isWeightLine(name: string): boolean {
  const m = name.trim().match(WEIGHT_AT_START);
  if (!m) return false;
  const rest = name.trim().slice(m[0].length);
  return !/\p{L}{4,}/u.test(rest.replace(/\b(for|per|awg|usd|eur|ang)\b/gi, "")) && /(for|@|x|\/|per)/i.test(rest);
}

/**
 * Fold weight lines into the product above: quantity becomes the weight, unit the weight unit and
 * unit_price the price per unit. The weight line is never kept as an item and its price is not
 * added again (the receipt prints the same amount on both lines).
 */
export function attachWeightLines(items: GroceryLine[]): GroceryLine[] {
  const out: GroceryLine[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (isWeightLine(it.name) && prev) {
      const m = it.name.trim().match(WEIGHT_AT_START)!;
      const weight = parseFloat(m[1].replace(",", "."));
      const unit = m[2].toLowerCase().replace(/^kgs$/, "kg").replace(/^lbs$/, "lb").replace(/^gr$/, "g");
      const perUnit = it.name.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(?:kg|lb|lbs|g|oz)/i);
      if (weight > 0) {
        if (!(prev.line_total > 0)) prev.line_total = it.line_total;
        prev.quantity = weight;
        prev.unit = unit;
        prev.unit_price = perUnit ? parseFloat(perUnit[1].replace(",", ".")) : Math.round((prev.line_total / weight) * 100) / 100;
      }
      continue;
    }
    if (isWeightLine(it.name)) continue; // orphan weight line: drop rather than create a junk item
    out.push({ ...it, name: cleanReceiptItemName(it.name), unit: it.unit ?? null });
  }
  return out;
}

const PRICE = /(-?\d{1,4}(?:[.,]\d{3})*[.,]\d{2})/;
const STOP_SECTION = /\b(sub\s*-?\s*total|subtotal|total|amount\s*due|balance\s*due|grand\s*total)\b/i;
// Payment and housekeeping lines. Words that can also start a product ("store brand", "card holder") only count in their receipt form.
const SKIP_LINE = /\b(tax|vat|btw|itbis|igv|gst|change|cash|tender(ed)?|visa|mastercard|master\s*card|amex|debit|credit|you\s*saved|total\s*savings|points|rewards|approval|auth(orization)?|thank|cashier|tel|phone|www|https?|survey|balance)\b|^\W*(?:ref(?:erence)?\b|receipt\b|invoice\b|savings\b|discount\b|coupon\b|card\s*(?:#|no\b|\d|x{2,}|\*|payment|type|\.{2,})|store\s*(?:#|no\b|\d))/i;

const WEIGHT_LINE = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(kg|lb|lbs|g|oz)\\s*[@xX×]\\s*${PRICE.source}`, "i");
// "3 x 1.25   3.75" or "3 @ 1.25" on a line of its own, below the product name
const QTY_LINE = new RegExp(`^(\\d{1,3})\\s*[@xX×]\\s*${PRICE.source}(?:\\s+${PRICE.source})?\\s*[A-Z]?$`);

function num(s: string): number {
  const t = s.replace(/[^\d.,-]/g, "");
  const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (last === -1) return parseFloat(t);
  return parseFloat(`${t.slice(0, last).replace(/[.,]/g, "")}.${t.slice(last + 1)}`);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Product code printed before the name ("0012345 MILK WHOLE") is not part of the name. */
const stripCode = (name: string) => name.replace(/^#?\d{4,}\s+/, "").replace(/^[*#]+\s*/, "");

export function parseLineItems(text: string): GroceryLine[] {
  const lines = cleanOcrText(text).split(/\r?\n/).map((l) => l.replace(/\s{2,}/g, "  ").trim()).filter(Boolean);
  const items: GroceryLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (STOP_SECTION.test(line) && items.length > 0) break; // everything after the subtotal is payment info
    if (SKIP_LINE.test(line)) continue;

    // Weighed item split over three lines: "TOMATOES" / "0.750 kg @ 3.99/kg" / "2.99"
    if (!PRICE.test(line) && /\p{L}{2}/u.test(line)) {
      const wl = lines[i + 1]?.match(WEIGHT_LINE);
      const pl = lines[i + 2]?.match(new RegExp(`^${PRICE.source}\\s*[A-Z]?$`));
      if (wl && pl) {
        const total = num(pl[1]);
        if (total > 0) {
          items.push({ name: stripCode(line), quantity: num(wl[1]), unit_price: num(wl[3]), line_total: total, category: guessGroceryCategory(line), unit: wl[2].toLowerCase() });
        }
        i += 2;
        continue;
      }
      // Counted item split over two lines: "COKE 330ML" / "3 x 1.25   3.75"
      const ql = lines[i + 1]?.match(QTY_LINE);
      if (ql && !SKIP_LINE.test(line)) {
        const qty = parseInt(ql[1], 10);
        const unit = num(ql[2]);
        const total = ql[3] ? num(ql[3]) : r2(qty * unit);
        const name = stripCode(line.replace(/[^\p{L}\p{N}&'.\-/ ]/gu, " ").replace(/\s{2,}/g, " ").trim());
        if (qty > 0 && total > 0 && name) {
          items.push({ name, quantity: qty, unit_price: unit, line_total: total, category: guessGroceryCategory(name), unit: null });
          i += 1;
          continue;
        }
      }
    }

    // "2 @ 1.50  RICE 1KG  3.00" (quantity and unit price first)
    const lead = line.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*[@xX×]\\s*${PRICE.source}\\s+(.*?[A-Za-z].*?)\\s+${PRICE.source}\\s*[A-Z]?$`));

    // "NAME 2 @ 1.99   3.98" or "NAME 2 x 1.99   3.98" inline
    const m = line.match(new RegExp(`^(.*?[A-Za-z].*?)\\s+(\\d+(?:[.,]\\d+)?)\\s*[@xX×]\\s*${PRICE.source}\\s+${PRICE.source}\\s*[A-Z]?$`));
    let name: string | null = null;
    let qty = 1;
    let unit: number | null = null;
    let total: number | null = null;
    let weightUnit: string | null = null;

    if (lead) {
      qty = num(lead[1]);
      unit = num(lead[2]);
      name = lead[3];
      total = num(lead[4]);
    } else if (m) {
      name = m[1];
      qty = num(m[2]);
      unit = num(m[3]);
      total = num(m[4]);
    } else {
      const t = line.match(new RegExp(`^(.*?[A-Za-z].*?)\\s+${PRICE.source}\\s*[A-Z]?$`));
      if (!t) continue;
      name = t[1];
      total = num(t[2]);
      const prefix = name.match(/^(\d{1,2})\s*[xX×]\s+(.*)$/);
      if (prefix) {
        qty = parseInt(prefix[1], 10);
        name = prefix[2];
      }
    }

    // A negative amount is a discount or a refund line, not a product
    if (total != null && total < 0) continue;

    // Weighted item on the next line: "1.234 kg @ 2.99/kg"
    const next = lines[i + 1];
    const w = next?.match(WEIGHT_LINE);
    if (w) {
      qty = num(w[1]);
      unit = num(w[3]);
      weightUnit = w[2].toLowerCase();
      i++;
    } else if (qty === 1 && total != null) {
      // Quantity printed under a priced line: "COKE 3.75" / "3 x 1.25"
      const q = next?.match(QTY_LINE);
      if (q) {
        const n = parseInt(q[1], 10);
        const u = num(q[2]);
        if (n > 1 && Math.abs(r2(n * u) - total) < 0.02) {
          qty = n;
          unit = u;
          i++;
        }
      }
    }

    name = stripCode(name.replace(/[^\p{L}\p{N}&'.\-/ ]/gu, " ").replace(/\s{2,}/g, " ").trim());
    if (!name || !/\p{L}{2}/u.test(name) || total == null || !Number.isFinite(total) || total <= 0) continue;
    if (qty <= 0 || !Number.isFinite(qty)) qty = 1;
    if (unit == null || !Number.isFinite(unit)) unit = Math.round((total / qty) * 100) / 100;

    items.push({ name, quantity: qty, unit_price: unit, line_total: total, category: guessGroceryCategory(name), unit: weightUnit });
  }
  return attachWeightLines(items);
}

/* ---------------- price statistics ---------------- */

export type PricePoint = { date: string; price: number; store: string };

export type PriceStats = {
  count: number;
  last: number;
  lastDate: string;
  previous: number | null;
  avg: number;
  min: number;
  max: number;
  changePct: number | null; // last vs previous purchase
  changeVsAvgPct: number | null;
  cheapestStore: string | null;
  trend: "up" | "down" | "flat" | "new";
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);

export function priceStats(points: PricePoint[]): PriceStats | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const prices = sorted.map((p) => p.price);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;

  // Cheapest store = lowest average price per store (needs 1+ purchases)
  const byStore = new Map<string, number[]>();
  for (const p of sorted) byStore.set(p.store, [...(byStore.get(p.store) || []), p.price]);
  let cheapest: { store: string; avg: number } | null = null;
  for (const [store, list] of byStore) {
    const a = list.reduce((s, p) => s + p, 0) / list.length;
    if (!cheapest || a < cheapest.avg) cheapest = { store, avg: a };
  }

  const changePct = prev ? pct(last.price, prev.price) : null;
  let trend: PriceStats["trend"] = "new";
  if (changePct != null) trend = changePct > 0.5 ? "up" : changePct < -0.5 ? "down" : "flat";

  return {
    count: sorted.length,
    last: last.price,
    lastDate: last.date,
    previous: prev ? prev.price : null,
    avg: round2(avg),
    min: Math.min(...prices),
    max: Math.max(...prices),
    changePct,
    changeVsAvgPct: pct(last.price, avg),
    cheapestStore: byStore.size > 1 ? cheapest!.store : null,
    trend,
  };
}

export type TrackerRow = {
  name: string;
  normalized_name: string;
  category: string;
  unit_price: number;
  quantity: number;
  unit?: string | null;
  line_total: number;
  receipt: { store: string; purchase_date: string; currency: string };
};

export type TrackedItem = {
  key: string;
  name: string;
  currency: string;
  unit: string | null;
  category: string;
  history: PricePoint[];
  stats: PriceStats;
  totalSpent: number;
};

/** Group item rows into one tracked item per (currency, normalised name). */
export function buildTracker(rows: TrackerRow[]): TrackedItem[] {
  const map = new Map<string, { rows: TrackerRow[] }>();
  for (const r of rows) {
    const key = `${r.receipt.currency}|${r.normalized_name}|${r.unit ?? ""}`;
    const g = map.get(key) || { rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  const out: TrackedItem[] = [];
  for (const [key, g] of map) {
    const history = g.rows
      .map((r) => ({ date: r.receipt.purchase_date, price: r.unit_price, store: r.receipt.store }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = [...g.rows].sort((a, b) => b.receipt.purchase_date.localeCompare(a.receipt.purchase_date))[0];
    out.push({
      key,
      name: latest.name,
      currency: latest.receipt.currency,
      unit: latest.unit ?? null,
      category: latest.category,
      history,
      stats: priceStats(history)!,
      totalSpent: round2(g.rows.reduce((s, r) => s + r.line_total, 0)),
    });
  }
  return out;
}

/* ---------------- monthly summaries ---------------- */

export type ReceiptLite = { id: string; purchase_date: string; total: number; currency: string };
export type ItemLite = { receipt_id: string; category: string; name: string; normalized_name: string; line_total: number };

export const monthOf = (date: string) => date.slice(0, 7);

export function monthlyTotals(receipts: ReceiptLite[], currency: string) {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of receipts) {
    if (r.currency !== currency) continue;
    const m = monthOf(r.purchase_date);
    const cur = map.get(m) || { total: 0, count: 0 };
    cur.total += r.total;
    cur.count += 1;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([month, v]) => ({ month, total: round2(v.total), count: v.count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function categoryTotals(receipts: ReceiptLite[], items: ItemLite[], month: string, currency: string) {
  const inMonth = new Set(receipts.filter((r) => r.currency === currency && monthOf(r.purchase_date) === month).map((r) => r.id));
  const map = new Map<string, number>();
  for (const it of items) {
    if (!inMonth.has(it.receipt_id)) continue;
    map.set(it.category, (map.get(it.category) || 0) + it.line_total);
  }
  return [...map.entries()].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total);
}

export function topItems(receipts: ReceiptLite[], items: ItemLite[], month: string, currency: string, limit = 5) {
  const inMonth = new Set(receipts.filter((r) => r.currency === currency && monthOf(r.purchase_date) === month).map((r) => r.id));
  const map = new Map<string, { name: string; total: number; count: number }>();
  for (const it of items) {
    if (!inMonth.has(it.receipt_id)) continue;
    const cur = map.get(it.normalized_name) || { name: it.name, total: 0, count: 0 };
    cur.total += it.line_total;
    cur.count += 1;
    map.set(it.normalized_name, cur);
  }
  return [...map.values()].map((v) => ({ ...v, total: round2(v.total) })).sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Percent change between two numbers, null when the base is zero. */
export const percentChange = pct;
