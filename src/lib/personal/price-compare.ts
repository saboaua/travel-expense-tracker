/**
 * Price tracker rules: which receipt lines are the same product (even from different stores and with different wording),
 * which store is cheaper, and how the price at each store moved. Pure functions, no I/O, so they are unit-tested.
 */
import { normalizeItemName, type PricePoint, type PriceStats, priceStats, type TrackerRow } from "@/lib/personal/grocery";

/* ---------------- sizes ---------------- */

export type SizeKind = "volume" | "weight" | "count";
export type Size = { kind: SizeKind; amount: number; label: string };

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s?(kg|kgs|gr|gm|g|lbs|lb|oz|ltr|lt|l|ml|cl|dl|ct|pk|pkt|pack|pcs|pc)\b/gi;
const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "33CL" and "330ML" are both 330 ml. Returns the first volume or weight in the name, else a count ("12 ct"), else null. */
export function parseSize(name: string): Size | null {
  let count: Size | null = null;
  for (const m of name.matchAll(SIZE_RE)) {
    const v = Number(m[1].replace(",", "."));
    if (!(v > 0)) continue;
    const u = m[2].toLowerCase();
    if (u === "ml") return vol(v);
    if (u === "cl") return vol(v * 10);
    if (u === "dl") return vol(v * 100);
    if (u === "l" || u === "lt" || u === "ltr") return vol(v * 1000);
    if (u === "g" || u === "gr" || u === "gm") return wt(v);
    if (u === "kg" || u === "kgs") return wt(v * 1000);
    if (u === "oz") return wt(v * 28.35);
    if (u === "lb" || u === "lbs") return wt(v * 453.6);
    count = count ?? { kind: "count", amount: v, label: `${trim(v)} ct` };
  }
  return count;
}
const vol = (ml: number): Size => ({ kind: "volume", amount: Math.round(ml), label: ml >= 1000 ? `${trim(ml / 1000)} L` : `${Math.round(ml)} ml` });
const wt = (g: number): Size => ({ kind: "weight", amount: Math.round(g), label: g >= 1000 ? `${trim(g / 1000)} kg` : `${Math.round(g)} g` });
const sizeKey = (s: Size | null) => (s ? `${s.kind[0]}${s.amount}` : "");

/* ---------------- matching ---------------- */

/** Words that describe the package or how it is served, not the product: "Bot" and "Cold" must not split a beer. */
const NOISE = new Set(["bot", "btl", "bottle", "bottles", "can", "cans", "tin", "cold", "chilled", "pet", "glass", "nr", "pcs", "pc", "each", "ea", "x"]);

export const productWords = (name: string): string[] => normalizeItemName(name).split(" ").filter((w) => w && !NOISE.has(w));

export type Atom = { key: string; match: string; size: Size | null; words: string[]; currency: string; unit: string | null };

/** One distinct receipt wording (kept apart so a wrong match can be undone). */
export function atomOf(name: string, currency: string, unit: string | null): Atom {
  const size = parseSize(name);
  const words = productWords(name);
  const raw = normalizeItemName(name);
  return {
    key: `${currency}|${raw}|${sizeKey(size)}|${unit ?? ""}`,
    match: `${currency}|${[...words].sort().join(" ")}|${sizeKey(size)}|${unit ?? ""}`,
    size, words, currency, unit,
  };
}

export type MatchDecision = { key_a: string; key_b: string; same: boolean };
export const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const pairId = (a: string, b: string) => pairOf(a, b).join("\u0001");

/** "Same product" suggestion between two groups that look alike but are not certain. */
export type Suggestion = { keyA: string; keyB: string; a: { name: string; stores: string[] }; b: { name: string; stores: string[] } };

/* ---------------- products ---------------- */

export type StoreSummary = {
  store: string;
  latest: PricePoint;
  previous: PricePoint | null;
  changePct: number | null;
  trend: PriceStats["trend"];
  count: number;
  /** Extra cost against the cheapest store's latest price (0 for the cheapest) */
  extra: number;
  extraPct: number | null;
  cheapest: boolean;
  /** The price is old (more than 60 days before the newest price of this product) */
  stale: boolean;
};

export type HistoryEntry = PricePoint & { name: string; changePct: number | null };

export type Product = {
  key: string;
  atomKeys: string[];
  name: string;
  size: string | null;
  currency: string;
  unit: string | null;
  category: string;
  /** The distinct wordings on the receipts */
  names: { atomKey: string; name: string }[];
  history: HistoryEntry[];
  stores: StoreSummary[];
  cheapestStore: string | null;
  /** What switching to the cheapest store would save against the store of the latest purchase, per unit */
  saving: { amount: number; pct: number; from: string; to: string } | null;
  stats: PriceStats;
  totalSpent: number;
  lastDate: string;
  count: number;
  /** Latest purchase against the previous one at the same store */
  trend: PriceStats["trend"];
  changePct: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct1 = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const trendOf = (p: number | null): PriceStats["trend"] => (p == null ? "new" : p > 0.5 ? "up" : p < -0.5 ? "down" : "flat");

/** A price is only compared to another price of the same product; the cheapest store is the one with the lowest latest price. */
export function summarizeStores(history: PricePoint[]): StoreSummary[] {
  const byStore = new Map<string, PricePoint[]>();
  for (const h of [...history].sort((a, b) => a.date.localeCompare(b.date))) byStore.set(h.store, [...(byStore.get(h.store) ?? []), h]);
  const newest = history.reduce((m, h) => (h.date > m ? h.date : m), "");
  const list = [...byStore.entries()].map(([store, pts]) => {
    const latest = pts[pts.length - 1];
    const previous = pts.length > 1 ? pts[pts.length - 2] : null;
    const changePct = previous ? pct1(latest.price, previous.price) : null;
    return { store, latest, previous, changePct, trend: trendOf(changePct), count: pts.length };
  });
  const low = Math.min(...list.map((s) => s.latest.price));
  return list
    .map((s) => ({
      ...s,
      extra: round2(s.latest.price - low),
      extraPct: s.latest.price === low ? 0 : pct1(s.latest.price, low),
      cheapest: s.latest.price === low,
      stale: dayDiff(s.latest.date, newest) > 60,
    }))
    .sort((a, b) => a.latest.price - b.latest.price || a.store.localeCompare(b.store));
}

/** Every purchase with its change against the previous purchase at the same store (newest first). */
export function historyWithChange(rows: { date: string; store: string; price: number; name: string }[]): HistoryEntry[] {
  const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lastAt = new Map<string, number>();
  const out = asc.map((r) => {
    const prev = lastAt.get(r.store);
    lastAt.set(r.store, r.price);
    return { ...r, changePct: prev == null ? null : pct1(r.price, prev) };
  });
  return out.reverse();
}

class Union {
  private p = new Map<string, string>();
  find(x: string): string { const q = this.p.get(x) ?? x; if (q === x) return x; const r = this.find(q); this.p.set(x, r); return r; }
  join(a: string, b: string) { this.p.set(this.find(a), this.find(b)); }
}

type Cluster = { atoms: string[]; rows: TrackerRow[] };

function cluster(rows: TrackerRow[], decisions: MatchDecision[]) {
  const atoms = new Map<string, { atom: Atom; rows: TrackerRow[] }>();
  for (const r of rows) {
    const a = atomOf(r.name, r.receipt.currency, r.unit ?? null);
    const g = atoms.get(a.key) ?? { atom: a, rows: [] };
    g.rows.push(r);
    atoms.set(a.key, g);
  }
  const blocked = new Set(decisions.filter((d) => !d.same).map((d) => pairId(d.key_a, d.key_b)));
  const uf = new Union();
  const members = new Map<string, string[]>(); // root -> atom keys
  for (const k of atoms.keys()) members.set(k, [k]);
  const tryJoin = (a: string, b: string) => {
    const ra = uf.find(a), rb = uf.find(b);
    if (ra === rb) return;
    const ma = members.get(ra) ?? [ra], mb = members.get(rb) ?? [rb];
    for (const x of ma) for (const y of mb) if (blocked.has(pairId(x, y))) return;
    uf.join(a, b);
    const root = uf.find(a);
    members.delete(ra); members.delete(rb);
    members.set(root, [...ma, ...mb]);
  };
  // 1) you said so, 2) the words and size are the same once packaging words are ignored
  for (const d of decisions) if (d.same && atoms.has(d.key_a) && atoms.has(d.key_b)) tryJoin(d.key_a, d.key_b);
  const byMatch = new Map<string, string>();
  for (const [k, g] of atoms) {
    if (!g.atom.words.length) continue;
    const first = byMatch.get(g.atom.match);
    if (first) tryJoin(first, k); else byMatch.set(g.atom.match, k);
  }
  const clusters = new Map<string, Cluster>();
  for (const [k, g] of atoms) {
    const root = uf.find(k);
    const c = clusters.get(root) ?? { atoms: [], rows: [] };
    c.atoms.push(k); c.rows.push(...g.rows);
    clusters.set(root, c);
  }
  return { atoms, clusters: [...clusters.values()], decided: new Set(decisions.map((d) => pairId(d.key_a, d.key_b))) };
}

export function buildProducts(rows: TrackerRow[], decisions: MatchDecision[] = []): { products: Product[]; suggestions: Suggestion[] } {
  const { atoms, clusters, decided } = cluster(rows, decisions);
  const products: Product[] = clusters.map((c) => {
    const firstAtom = atoms.get(c.atoms[0])!.atom;
    const latestRow = [...c.rows].sort((a, b) => b.receipt.purchase_date.localeCompare(a.receipt.purchase_date))[0];
    const named = c.atoms.map((k) => ({ atomKey: k, name: atoms.get(k)!.rows[0].name }));
    const history = historyWithChange(c.rows.map((r) => ({ date: r.receipt.purchase_date, store: r.receipt.store, price: r.unit_price, name: r.name })));
    const asc = [...history].reverse();
    const stores = summarizeStores(asc);
    const lastStore = stores.find((s) => s.store === asc[asc.length - 1].store)!;
    const low = stores.find((s) => s.cheapest)!;
    const multi = stores.length > 1;
    const saving = multi && !lastStore.cheapest && lastStore.extra > 0
      ? { amount: lastStore.extra, pct: round2((lastStore.extra / lastStore.latest.price) * 100), from: lastStore.store, to: low.store }
      : null;
    // a product with one wording keeps that wording as its name; with several, the plainest one (fewest packaging words) wins
    const display = [...named].sort((a, b) => productWords(a.name).length - productWords(b.name).length || a.name.length - b.name.length)[0];
    const size = c.atoms.map((k) => atoms.get(k)!.atom.size).find(Boolean) ?? null;
    return {
      key: [...c.atoms].sort()[0],
      atomKeys: c.atoms,
      name: cleanName(display.name),
      size: size ? size.label : null,
      currency: firstAtom.currency,
      unit: latestRow.unit ?? null,
      category: latestRow.category,
      names: named,
      history,
      stores,
      cheapestStore: multi ? low.store : null,
      saving,
      stats: priceStats(asc.map((h) => ({ date: h.date, price: h.price, store: h.store })))!,
      totalSpent: round2(c.rows.reduce((s, r) => s + r.line_total, 0)),
      lastDate: asc[asc.length - 1].date,
      count: asc.length,
      trend: lastStore.trend,
      changePct: lastStore.changePct,
    };
  });

  // Pairs that look alike but are not certain. Same size on both sides, so a 330 ml and a 1.5 L are never offered.
  const suggestions: Suggestion[] = [];
  const bucket = new Map<string, Product[]>();
  for (const p of products) {
    const a = atoms.get(p.atomKeys[0])!.atom;
    if (!a.size || !a.words.length) continue;
    const k = `${a.currency}|${sizeKey(a.size)}|${a.unit ?? ""}`;
    bucket.set(k, [...(bucket.get(k) ?? []), p]);
  }
  for (const list of bucket.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      if (A.atomKeys.some((x) => B.atomKeys.some((y) => decided.has(pairId(x, y))))) continue;
      if (!looksAlike(wordsOf(A, atoms), wordsOf(B, atoms))) continue;
      suggestions.push({
        keyA: A.atomKeys[0], keyB: B.atomKeys[0],
        a: { name: A.names[0].name, stores: [...new Set(A.history.map((h) => h.store))] },
        b: { name: B.names[0].name, stores: [...new Set(B.history.map((h) => h.store))] },
      });
    }
  }
  return { products, suggestions: suggestions.slice(0, 5) };
}

const wordsOf = (p: Product, atoms: Map<string, { atom: Atom }>) => [...new Set(p.atomKeys.flatMap((k) => atoms.get(k)!.atom.words))];
/** "Corona Extra Bot 33CL" -> "Corona Extra": the size is shown beside the name and packaging words are dropped. */
export function cleanName(name: string): string {
  const out = name.replace(SIZE_RE, " ").split(/\s+/).filter((w) => w && !NOISE.has(w.toLowerCase().replace(/[^a-z]/g, ""))).join(" ");
  return out || name;
}

/** Not equal, yet close: one wording is inside the other (two words at least), or most words are shared. */
export function looksAlike(a: string[], b: string[]): boolean {
  const A = new Set(a), B = new Set(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  if (!shared || (shared === A.size && shared === B.size)) return false;
  const small = Math.min(A.size, B.size);
  if (shared === small && small >= 2) return true;
  return shared / (A.size + B.size - shared) >= 0.6;
}

/* ---------------- list helpers ---------------- */

export type PriceFilter = "all" | "up" | "down" | "elsewhere" | "stores";
export function matchesFilter(p: Product, f: PriceFilter): boolean {
  switch (f) {
    case "up": return p.trend === "up";
    case "down": return p.trend === "down";
    case "elsewhere": return p.saving != null;
    case "stores": return p.stores.length > 1;
    default: return true;
  }
}
export function priceSummary(list: Product[]) {
  return {
    up: list.filter((p) => p.trend === "up").length,
    down: list.filter((p) => p.trend === "down").length,
    elsewhere: list.filter((p) => p.saving).length,
    saveTotal: round2(list.reduce((s, p) => s + (p.saving?.amount ?? 0), 0)),
    stores: new Set(list.flatMap((p) => p.stores.map((s) => s.store))).size,
  };
}
