import { agoText } from "@/lib/personal/smart-cart";
import { MIN_SHARED, type Level, type StoreBasket, type StoreIndex } from "@/lib/personal/basket";

export type Verdict = { store: string; /** the next store that prices as many items, if any */ rival: string | null; /** what the best store saves against that rival (0 for a tie) */ gap: number; priced: number; of: number };

/** The headline for the best store: what it saves against the next store that prices the same items. Null with no priced store. */
export function verdict(ranked: StoreBasket[], itemCount: number): Verdict | null {
  const best = ranked.find((b) => b.priced > 0);
  if (!best || itemCount === 0) return null;
  const rival = ranked.find((b) => b !== best && b.priced === best.priced);
  return { store: best.store, rival: rival?.store ?? null, gap: rival ? Math.max(0, Math.round((rival.total - best.total) * 100) / 100) : 0, priced: best.priced, of: itemCount };
}

export type Unpriced = { store: string; km: number | null; missing: string[]; level: Level; levelPct: number | null };

/** Nearby stores that have no price for anything on the list, so they cannot be totalled. They are listed, not hidden. */
export function unpricedStores(baskets: StoreBasket[], kmOf: (store: string) => number | null, radius: number, hasPlace: boolean): Unpriced[] {
  return baskets
    .filter((b) => b.priced === 0)
    .map((b) => ({ store: b.store, km: kmOf(b.store), missing: b.lines.filter((l) => l.status === "unknown").map((l) => l.name), level: b.level, levelPct: b.levelPct }))
    .filter((u) => !hasPlace || (u.km != null && u.km <= radius))
    .sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || a.store.localeCompare(b.store));
}

export type GridRow = { key: string; name: string; qty: number; cells: (number | null)[]; cheapest: number[]; differs: boolean };
export type Grid = { stores: string[]; rows: GridRow[]; sharedCount: number; totals: number[]; priced: number[]; leader: { index: number; gap: number } | null; allShared: boolean };

/** Item by item for the first few stores. Totals use only the items every store prices, so a store is never ahead for missing items. */
export function itemGrid(ranked: StoreBasket[], max = 3): Grid | null {
  const cols = ranked.filter((b) => b.priced > 0).slice(0, max);
  if (cols.length < 2) return null;
  const first = cols[0].lines;
  const rows: GridRow[] = first.map((l, i) => {
    const cells = cols.map((c) => { const x = c.lines[i]; return x && (x.status === "priced" || x.status === "old") && x.total != null ? x.total : null; });
    const have = cells.filter((c): c is number => c != null);
    const min = have.length ? Math.min(...have) : null;
    const differs = have.length < cells.length || new Set(have).size > 1;
    return { key: l.key, name: l.name, qty: l.qty, cells, cheapest: min != null && have.length > 1 && new Set(have).size > 1 ? cells.flatMap((c, ci) => (c === min ? [ci] : [])) : [], differs };
  });
  const shared = rows.filter((r) => r.cells.every((c) => c != null));
  const totals = cols.map((_, ci) => Math.round(shared.reduce((s, r) => s + (r.cells[ci] as number), 0) * 100) / 100);
  const lo = Math.min(...totals);
  const order = [...totals].sort((a, b) => a - b);
  const li = totals.indexOf(lo);
  return {
    stores: cols.map((c) => c.store), rows, sharedCount: shared.length, totals,
    priced: cols.map((c) => c.priced),
    leader: shared.length > 0 && order[1] > order[0] ? { index: li, gap: Math.round((order[1] - order[0]) * 100) / 100 } : null,
    allShared: shared.length === rows.length,
  };
}

export type LevelRow = { store: string; pct: number | null; level: Level; shared: number; listNote: string | null };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;

/** The price level, cheapest first, each store with where it stands on your list. Stores with too few shared products come last, apart. */
export function levelRows(index: StoreIndex[], baskets: StoreBasket[], itemCount: number): { rated: LevelRow[]; needMore: LevelRow[]; minShared: number } {
  const priced = baskets.filter((b) => b.priced > 0);
  const note = (store: string): string | null => {
    if (itemCount === 0) return null;
    const at = priced.findIndex((b) => b.store === store);
    if (at < 0) return "no price yet";
    return at === 0 ? "cheapest" : `${ordinal(at + 1)} of ${priced.length}`;
  };
  const rows = index.map((s) => ({ store: s.store, pct: s.pct, level: s.level, shared: s.shared, listNote: note(s.store) }));
  return {
    rated: rows.filter((r) => r.pct != null).sort((a, b) => (a.pct as number) - (b.pct as number) || a.store.localeCompare(b.store)),
    needMore: rows.filter((r) => r.pct == null).sort((a, b) => b.shared - a.shared || a.store.localeCompare(b.store)),
    minShared: MIN_SHARED,
  };
}

/** Where a store's prices come from and how fresh they are: "Your receipts, 3 days ago". Null when nothing is priced. */
export function sourceNote(b: StoreBasket, now: Date): string | null {
  const priced = b.lines.filter((l) => l.status === "priced" || l.status === "old");
  if (!priced.length) return null;
  const names = [...new Set(priced.map((l) => (l.source === "community" ? "Community" : l.source === "online" ? "Online list" : "Your receipts")))];
  const newest = priced.map((l) => l.date).filter((d): d is string => !!d).sort().pop();
  const ago = newest ? agoText(newest, now) : null;
  return ago ? `${names.join(" + ")}, ${ago}` : names.join(" + ");
}

/** "5.4% above average" for a store with a price level; null when it has none. */
export function levelWords(pct: number | null): string | null {
  if (pct == null) return null;
  const n = Math.abs(pct);
  return n < 0.5 ? "About average" : `${n}% ${pct > 0 ? "above" : "below"} average`;
}
