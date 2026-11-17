/**
 * What the Personal dashboard shows about prices, from the same data as the Price tracker and Best store pages:
 * the counts and the biggest movers, and the cheapest store for the shopping list. Pure functions, unit-tested.
 * Only your own receipts are used here (no distance, no community or online prices), so it is quick and works offline;
 * the pages hold the full picture.
 */
import { buildProducts, priceSummary, type MatchDecision, type Product } from "@/lib/personal/price-compare";
import { basketTotals, storeIndex, sameStore, type ListItem } from "@/lib/personal/basket";
import type { TrackerRow } from "@/lib/personal/grocery";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Mover = { name: string; store: string; pct: number };
export type TrackerGlance = {
  currency: string;
  items: number;
  stores: number;
  up: number;
  down: number;
  /** What switching stores would save on the items you bought, in total (0 when nothing is cheaper elsewhere) */
  saveTotal: number;
  /** The item that went up the most, and the one that came down the most (null when none moved) */
  riser: Mover | null;
  faller: Mover | null;
};
export type BestGlance = {
  currency: string;
  store: string;
  total: number;
  /** Items on the list, and how many of them have a price at this store */
  listItems: number;
  priced: number;
  /** What the next store costs more, when it prices as many items (null when there is no fair comparison) */
  saving: number | null;
};
export type PricesGlance = { tracker: TrackerGlance | null; best: BestGlance | null };

/** The currency with the most purchases: the one the dashboard talks in. */
function mainCurrency(products: Product[]): string | null {
  const n = new Map<string, number>();
  for (const p of products) n.set(p.currency, (n.get(p.currency) ?? 0) + p.count);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const mover = (p: Product): Mover => ({ name: p.size ? `${p.name} ${p.size}` : p.name, store: p.stores[0]?.store ?? "", pct: Math.round(Math.abs(p.changePct ?? 0)) });

export function priceGlance(rows: TrackerRow[], decisions: MatchDecision[], list: { product_key: string; qty: number }[], now: Date): PricesGlance {
  const { products } = buildProducts(rows, decisions);
  const currency = mainCurrency(products);
  if (!currency) return { tracker: null, best: null };
  const inCur = products.filter((p) => p.currency === currency);

  const s = priceSummary(inCur);
  const ups = inCur.filter((p) => p.trend === "up" && (p.changePct ?? 0) > 0.5).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const downs = inCur.filter((p) => p.trend === "down" && (p.changePct ?? 0) < -0.5).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  const tracker: TrackerGlance = { currency, items: inCur.length, stores: s.stores, up: s.up, down: s.down, saveTotal: s.saveTotal, riser: ups[0] ? mover(ups[0]) : null, faller: downs[0] ? mover(downs[0]) : null };

  const items: ListItem[] = list.filter((l) => inCur.some((p) => p.key === l.product_key)).map((l) => ({ key: l.product_key, qty: l.qty }));
  let best: BestGlance | null = null;
  if (items.length > 0) {
    const stores: string[] = [];
    for (const n of inCur.flatMap((p) => p.stores.map((x) => x.store))) if (!stores.some((x) => sameStore(x, n))) stores.push(n);
    const baskets = basketTotals(items, inCur, stores, storeIndex(inCur, currency, now), now);
    const top = baskets[0];
    if (top && top.priced > 0) {
      const next = baskets.find((b, i) => i > 0 && b.priced === top.priced);
      best = { currency, store: top.store, total: top.total, listItems: items.length, priced: top.priced, saving: next ? round2(next.total - top.total) : null };
    }
  }
  return { tracker, best };
}
