import type { OnlineSite } from "@/lib/personal/online-orders";

/** Reads the order confirmation emails of Amazon, AliExpress and eBay. Careful, never guessing: what it cannot find stays empty. */
export type ParsedOrder = {
  site: OnlineSite;
  order_ref: string | null;
  order_date: string;
  total: number;
  currency: string;
  arrives_on: string | null;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
};

/** The site an email sender belongs to. Only the shop's own domains count. */
export function orderSiteOfSender(email: string | null | undefined): OnlineSite | null {
  const d = (email ?? "").toLowerCase().split("@")[1] ?? "";
  if (!d) return null;
  const is = (root: string) => d === root || d.endsWith(`.${root}`);
  if (/(^|\.)amazon\.(com|co\.uk|de|fr|it|es|nl|ca|co\.jp|com\.au|com\.mx|com\.br|in|se|pl|ae|sa|sg|com\.tr|com\.be|ie)$/.test(d)) return "amazon";
  if (is("aliexpress.com") || is("aliexpress.us")) return "aliexpress";
  if (/(^|\.)ebay\.(com|co\.uk|de|fr|it|es|ca|com\.au|ie|nl|at|ch|pl|com\.sg|com\.hk)$/.test(d)) return "ebay";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
const pad = (n: number) => String(n).padStart(2, "0");

const CUR: [RegExp, string][] = [[/^US\s*\$|^USD|^\$/i, "USD"], [/^€|^EUR/i, "EUR"], [/^£|^GBP/i, "GBP"], [/^AWG|^Afl/i, "AWG"], [/^CA\$|^C\$|^CAD/i, "CAD"], [/^SRD/i, "SRD"]];
const currencyOf = (s: string): string | null => CUR.find(([re]) => re.test(s.trim()))?.[1] ?? null;

/** "1,234.56", "1.234,56", "67,48" and "67.48" all read as numbers */
export function readAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (lastComma >= 0) s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

const MONEY = String.raw`((?:US\s*\$|USD|CA\$|C\$|CAD|EUR|GBP|AWG|Afl\.?|SRD|[$€£])\s*[\d.,]+|[\d.,]+\s*(?:USD|EUR|GBP|AWG|CAD|SRD))`;
const moneyParts = (s: string): { amount: number; currency: string } | null => {
  const cur = currencyOf(s.replace(/^[\d.,\s]+/, "")) ?? currencyOf(s);
  const amount = readAmount(s);
  return amount != null && cur ? { amount, currency: cur } : null;
};

const dateIn = (s: string, ref: string): string | null => {
  // "December 3, 2026", "Dec 3", "Thursday, December 3", "3 December"
  const a = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/.exec(s);
  const b = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(20\d{2}))?/.exec(s);
  let m = -1, d = 0, y: number | null = null;
  if (a && monthOf(a[1]) >= 0) { m = monthOf(a[1]); d = +a[2]; y = a[3] ? +a[3] : null; }
  else if (b && monthOf(b[2]) >= 0) { m = monthOf(b[2]); d = +b[1]; y = b[3] ? +b[3] : null; }
  if (m < 0 || d < 1 || d > 31) return null;
  let year = y ?? +ref.slice(0, 4);
  let iso = `${year}-${pad(m + 1)}-${pad(d)}`;
  if (y == null && iso < ref) { year += 1; iso = `${year}-${pad(m + 1)}-${pad(d)}`; }
  return iso;
};

/** Amazon puts "Quantity: 1" under the product name and the price near it */
function readItems(lines: string[]): ParsedOrder["items"] {
  const out: ParsedOrder["items"] = [];
  for (let i = 1; i < lines.length; i++) {
    const q = /^quantity:?\s*(\d{1,3})\b/i.exec(lines[i]);
    if (!q) continue;
    const name = lines[i - 1].replace(/^[*\-•\s]+/, "").trim();
    if (name.length < 3 || /^(order|total|quantity|shipping|arriving)/i.test(name)) continue;
    let price: number | null = null;
    for (let j = i + 1; j <= i + 3 && j < lines.length && price == null; j++) { const m = new RegExp(MONEY, "i").exec(lines[j]); if (m) price = moneyParts(m[1])?.amount ?? null; }
    if (price == null) continue;
    const quantity = +q[1];
    // the printed price is the line price; the unit price is worked out from it
    out.push({ name: name.slice(0, 160), quantity, unit_price: Math.round((price / quantity) * 100) / 100, line_total: price });
  }
  return out;
}

export function parseOrderEmail(i: { site: OnlineSite; text: string; date: string }): ParsedOrder | null {
  const text = i.text.replace(/\r/g, "").replace(/\*/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // the order total: the label, then the amount on the same or the next line
  let total: { amount: number; currency: string } | null = null;
  for (let k = 0; k < lines.length && !total; k++) {
    if (!/^(order total|grand total|total for this order|total)\b[^a-z]{0,3}/i.test(lines[k]) || /subtotal|before tax/i.test(lines[k])) continue;
    const here = new RegExp(MONEY, "i").exec(lines[k]) ?? new RegExp(MONEY, "i").exec(lines[k + 1] ?? "");
    if (here) total = moneyParts(here[1]);
  }
  if (!total || total.amount <= 0) return null;

  const ref = /order\s*(?:#|number|id|no\.?)\s*:?\s*#?\s*([0-9][0-9-]{7,24})/i.exec(text)?.[1] ?? null;
  const placed = /order(?:ed| placed| date)[^\n]{0,20}?:?\s*([^\n]{0,40})/i.exec(text);
  const order_date = (placed && dateIn(placed[1], i.date) && placed[1].match(/20\d{2}/) ? dateIn(placed[1], i.date) : null) ?? i.date;

  let arrives_on: string | null = null;
  const arr = /(arriving|arrives|estimated delivery|delivery estimate|expected delivery|delivery by|will arrive)([^\n]{0,90})/i.exec(text);
  if (arr) {
    const found = [...arr[2].matchAll(/([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?(?:,?\s+20\d{2})?)/g)].map((m) => dateIn(m[1], order_date)).filter((d): d is string => !!d);
    arrives_on = found.length ? found[found.length - 1] : null;
  }
  return { site: i.site, order_ref: ref, order_date, total: total.amount, currency: total.currency, arrives_on, items: readItems(lines) };
}
