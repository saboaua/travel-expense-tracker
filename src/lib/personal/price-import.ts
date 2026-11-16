/**
 * Reads the admin's Excel list of supermarket prices (store, product, price, currency, optional unit) into the same rows the app shares
 * from receipts, with the same store and product keys, so an uploaded price lands on the same product as a shopper's. Pure, so it is unit-tested.
 */
import { createHash } from "node:crypto";
import { num } from "@/lib/personal/supermarket-import";
import { parseSize, productWords } from "@/lib/personal/price-compare";
import { productKey, storeKey, type SharedRow } from "@/lib/personal/community";

export const MAX_PRICE_ROWS = 5000;
export type PriceSkips = { missing: number; badPrice: number; duplicate: number; example: number; farOff: number };
export type PriceParse = { rows: SharedRow[]; total: number; skipped: PriceSkips };

const HEAD = {
  store: ["store", "shop", "supermarket", "store name"],
  product: ["product", "item", "product name", "item name", "description"],
  price: ["price", "unit price", "amount"],
  currency: ["currency", "curr", "cur"],
  unit: ["unit", "per", "sold by"],
};
const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

export function mapPriceHeaders(head: unknown[]): { store?: number; product?: number; price?: number; currency?: number; unit?: number; missing: string[] } {
  const find = (names: string[]) => { const i = head.findIndex((h) => names.includes(norm(h))); return i < 0 ? undefined : i; };
  const m = { store: find(HEAD.store), product: find(HEAD.product), price: find(HEAD.price), currency: find(HEAD.currency), unit: find(HEAD.unit) };
  const missing: string[] = [];
  if (m.store == null) missing.push("Store");
  if (m.product == null) missing.push("Product");
  if (m.price == null) missing.push("Price");
  if (m.currency == null) missing.push("Currency");
  return { ...m, missing };
}

const UNITS = new Set(["kg", "lb", "g"]);

/** Rows after the header. A store that starts with EXAMPLE is the template's sample and is never imported. */
export function parsePrices(head: unknown[], body: unknown[][]): PriceParse | { error: string } {
  const m = mapPriceHeaders(head);
  if (m.missing.length) return { error: `The file has no ${m.missing.map((x) => `${x}`).join(" or ")} column. Nothing was imported. Use the template headings.` };
  const out: SharedRow[] = [];
  const seen = new Set<string>();
  const skipped: PriceSkips = { missing: 0, badPrice: 0, duplicate: 0, example: 0, farOff: 0 };
  let total = 0;
  for (const r of body) {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    total++;
    const store = String(r[m.store!] ?? "").trim().slice(0, 120);
    const product = String(r[m.product!] ?? "").trim().slice(0, 160);
    if (/^example\b/i.test(store)) { skipped.example++; continue; }
    const sk = storeKey(store);
    if (!sk || !productWords(product).length) { skipped.missing++; continue; }
    const price = num(r[m.price!]);
    const currency = String(r[m.currency!] ?? "").trim().toUpperCase();
    if (price == null || !(price > 0) || price >= 100000 || !/^[A-Z]{3}$/.test(currency)) { skipped.badPrice++; continue; }
    const unitRaw = m.unit != null ? String(r[m.unit] ?? "").trim().toLowerCase() : "";
    const unit = UNITS.has(unitRaw) ? unitRaw : null;
    const size = parseSize(product);
    const key = productKey({ name: product, size: size ? size.label : null, currency, unit });
    const row: SharedRow = { store_key: sk, store_name: store, product_key: key, product_name: product, size_label: size ? size.label : null, currency, price: Math.round(price * 100) / 100 };
    const dupe = `${sk}|${key}`;
    if (seen.has(dupe)) { skipped.duplicate++; continue; }
    seen.add(dupe);
    out.push(row);
  }
  return { rows: out, total, skipped };
}

const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };

/** Leaves out prices far from the usual for the product (under 0.4x or over 2.5x the middle price of the file and what is already shared),
 *  so a typo like 18.5 for 1.85 never shows. Needs 3 or more prices of the product to judge. */
export function splitFarOff(rows: SharedRow[], existing: Map<string, number[]>): { kept: SharedRow[]; farOff: SharedRow[] } {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.product_key, [...(by.get(r.product_key) ?? []), r.price]);
  const kept: SharedRow[] = [], farOff: SharedRow[] = [];
  for (const r of rows) {
    const all = [...(by.get(r.product_key) ?? []), ...(existing.get(r.product_key) ?? [])];
    if (all.length >= 3) { const med = median(all); if (r.price < med * 0.4 || r.price > med * 2.5) { farOff.push(r); continue; } }
    kept.push(r);
  }
  return { kept, farOff };
}

/** One fingerprint for a list of prices, however the file was saved: the same rows give the same fingerprint. */
export function rowsFingerprint(rows: SharedRow[]): string {
  const lines = rows.map((r) => `${r.store_key}|${r.product_key}|${r.price.toFixed(2)}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
