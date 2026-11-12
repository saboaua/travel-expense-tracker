/**
 * Online supermarket prices for the price tracker: reading each shop's public product list, and finding which of its
 * products is the one you bought. Pure functions (no I/O) except the two fetchers, which take `fetch` so tests can fake it.
 * Online prices are only ever shown next to what you paid; they are never part of your spending.
 */
import { parseSize, productWords, wordsClose, type Size } from "@/lib/personal/price-compare";

export type StoreId = "superfood" | "ling";
export const STORES: Record<StoreId, { name: string; site: string }> = {
  superfood: { name: "Super Food Plaza", site: "shop.superfoodaruba.com" },
  ling: { name: "Ling & Sons", site: "shop.lingandsons.com" },
};
export const STORE_IDS = Object.keys(STORES) as StoreId[];
export const ONLINE_CURRENCY = "AWG";

export type CatalogRow = { store: StoreId; item_id: string; name: string; name_norm: string; size_text: string | null; price: number; url: string | null };
export type CatalogItem = Omit<CatalogRow, "name_norm"> & { fetched_at: string };

const UA = "TravelExpenseTracker/1.0 (price comparison for personal use; https://github.com/saboaua/travel-expense-tracker)";

/** "500 gram" -> "500 g", "1 liter" -> "1 l", so the size reader understands the shop's words. */
export function tidySize(text: string | null | undefined): string | null {
  const s = (text ?? "").toLowerCase().trim();
  if (!s || /^(each|ea|unit|piece|pc|pcs|lb\.?|per lb)$/.test(s)) return null;
  const out = s
    .replace(/\bmilliliters?\b|\bmillilitres?\b/g, "ml")
    .replace(/\bcentiliters?\b|\bcentilitres?\b/g, "cl")
    .replace(/\bliters?\b|\blitres?\b/g, "l")
    .replace(/\bkilograms?\b|\bkilos?\b/g, "kg")
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bounces?\b/g, "oz")
    .replace(/\bpounds?\b/g, "lb")
    .replace(/\bcount\b|\bcounts\b|\bpieces\b/g, "ct")
    .replace(/\s+/g, " ");
  return out.slice(0, 40);
}

const searchText = (name: string, size: string | null) => `${name} ${size ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300);
const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

/* ---------------- Super Food Plaza (Freshop) ---------------- */

type FreshopItem = { id?: string; name?: string; unit_price?: number | string; size?: string; product_size?: string; canonical_url?: string; status?: string };

export function mapFreshop(items: FreshopItem[]): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (const i of items) {
    const price = num(i.unit_price);
    const name = (i.name ?? "").trim();
    if (!i.id || !name || price == null || price <= 0) continue;
    if (i.status && i.status !== "available") continue;
    const size = tidySize(i.size ?? i.product_size);
    out.push({ store: "superfood", item_id: String(i.id), name: name.slice(0, 200), name_norm: searchText(name, size), size_text: size, price: Math.round(price * 100) / 100, url: i.canonical_url ?? null });
  }
  return out;
}

/* ---------------- Ling & Sons (Shopify) ---------------- */

type ShopifyProduct = { title?: string; handle?: string; variants?: { id?: number | string; title?: string; price?: string | number; available?: boolean }[] };

export function mapShopify(products: ShopifyProduct[], origin = "https://shop.lingandsons.com"): CatalogRow[] {
  const out: CatalogRow[] = [];
  for (const p of products) {
    const title = (p.title ?? "").trim();
    if (!title || !p.handle) continue;
    const variants = p.variants ?? [];
    for (const v of variants) {
      const price = num(v.price);
      if (price == null || price <= 0) continue;
      const plain = !v.title || v.title === "Default Title";
      const name = plain ? title : `${title} ${v.title}`;
      out.push({
        store: "ling", item_id: variants.length > 1 && v.id != null ? `${p.handle}#${v.id}` : p.handle,
        name: name.slice(0, 200), name_norm: searchText(name, null), size_text: null, price: Math.round(price * 100) / 100,
        url: `${origin}/products/${p.handle}`,
      });
    }
  }
  return out;
}

/* ---------------- fetching the lists ---------------- */

type Fetcher = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const res = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15000), cache: "no-store" } as RequestInit);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type FetchLimits = { maxPages?: number; pageSize?: number; pauseMs?: number; until?: number };

export async function fetchSuperFood(fetcher: Fetcher = fetch, o: FetchLimits = {}): Promise<{ rows: CatalogRow[]; complete: boolean }> {
  const key = process.env.FRESHOP_APP_KEY || "super_food_plaza_aruba";
  const size = o.pageSize ?? 100;
  const rows = new Map<string, CatalogRow>();
  let skip = 0;
  let firstId: string | null = null;
  for (let page = 0; page < (o.maxPages ?? 80); page++) {
    if (o.until && Date.now() > o.until) return { rows: [...rows.values()], complete: false };
    const d = await getJson<{ items?: FreshopItem[]; total?: number }>(`https://api.freshop.com/1/products?app_key=${encodeURIComponent(key)}&limit=${size}&skip=${skip}`, fetcher);
    const items = d.items ?? [];
    if (items.length === 0) return { rows: [...rows.values()], complete: true };
    // A page that repeats the first one means the shop ignored `skip`: stop instead of looping
    if (page > 0 && items[0]?.id === firstId) return { rows: [...rows.values()], complete: false };
    if (page === 0) firstId = items[0]?.id ?? null;
    for (const r of mapFreshop(items)) rows.set(r.item_id, r);
    skip += items.length;
    if (typeof d.total === "number" && skip >= d.total) return { rows: [...rows.values()], complete: true };
    if (items.length < size && typeof d.total !== "number") return { rows: [...rows.values()], complete: true };
    await sleep(o.pauseMs ?? 300);
  }
  return { rows: [...rows.values()], complete: false };
}

export async function fetchLing(fetcher: Fetcher = fetch, o: FetchLimits = {}): Promise<{ rows: CatalogRow[]; complete: boolean }> {
  const size = o.pageSize ?? 250;
  const rows = new Map<string, CatalogRow>();
  for (let page = 1; page <= (o.maxPages ?? 60); page++) {
    if (o.until && Date.now() > o.until) return { rows: [...rows.values()], complete: false };
    const d = await getJson<{ products?: ShopifyProduct[] }>(`https://shop.lingandsons.com/collections/all/products.json?limit=${size}&page=${page}`, fetcher);
    const products = d.products ?? [];
    if (products.length === 0) return { rows: [...rows.values()], complete: true };
    for (const r of mapShopify(products)) rows.set(r.item_id, r);
    if (products.length < size) return { rows: [...rows.values()], complete: true };
    await sleep(o.pauseMs ?? 300);
  }
  return { rows: [...rows.values()], complete: false };
}

/* ---------------- finding your product in a shop ---------------- */

export type OnlineMatch = {
  store: StoreId;
  storeName: string;
  itemId: string;
  name: string;
  size: string | null;
  price: number;
  url: string | null;
  fetchedAt: string;
  /** same = same words and size (or you said so); ask = close, needs your answer */
  status: "same" | "ask";
  confirmed: boolean;
  score: number;
};

const sizeSig = (s: Size | null) => (s ? `${s.kind}${s.amount}` : "");

/** How well a shop product fits what you bought, or null when it is certainly not it (a different size, or too few shared words). */
export function scoreCandidate(want: { words: string[]; size: Size | null }, cand: { name: string; size_text: string | null }): { score: number; status: "same" | "ask" } | null {
  const text = `${cand.name} ${cand.size_text ?? ""}`;
  const cSize = parseSize(text);
  if (want.size && cSize && sizeSig(want.size) !== sizeSig(cSize)) return null;
  const cWords = [...new Set(productWords(cand.name))];
  const wWords = [...new Set(want.words)];
  if (!wWords.length || !cWords.length) return null;
  const taken = new Set<number>();
  let shared = 0;
  for (const w of wWords) {
    const at = cWords.findIndex((x, i) => !taken.has(i) && wordsClose(w, x));
    if (at >= 0) { taken.add(at); shared++; }
  }
  if (!shared) return null;
  const extra = cWords.length - shared;
  const missing = wWords.length - shared;
  const sizesKnownAndEqual = !!want.size && !!cSize;
  // everything you bought is in their name, with at most one extra word, and the size agrees (or neither has one)
  if (missing === 0 && extra <= 1 && (sizesKnownAndEqual || (!want.size && !cSize))) return { score: 1 - extra * 0.05, status: "same" };
  const union = wWords.length + cWords.length - shared;
  const jac = shared / union;
  if (jac >= 0.6 || (missing === 0 && extra <= 3)) return { score: jac * 0.8, status: "ask" };
  return null;
}

export type Wanted = { key: string; names: string[] };
export type Answer = { product_key: string; store: string; item_id: string; same: boolean };

/** The best shop product per store for each thing you bought. A product you said "No" to is never offered again. */
export function matchProducts(wanted: Wanted[], catalog: CatalogItem[], answers: Answer[] = [], enabled: StoreId[] = STORE_IDS): Record<string, OnlineMatch[]> {
  const said = new Map(answers.map((a) => [`${a.product_key}|${a.store}|${a.item_id}`, a.same]));
  const byStore = new Map<StoreId, CatalogItem[]>();
  for (const c of catalog) if (enabled.includes(c.store)) byStore.set(c.store, [...(byStore.get(c.store) ?? []), c]);
  const out: Record<string, OnlineMatch[]> = {};
  for (const w of wanted) {
    const wants = w.names.map((n) => ({ words: productWords(n), size: parseSize(n) }));
    const found: OnlineMatch[] = [];
    for (const [store, items] of byStore) {
      let best: OnlineMatch | null = null;
      for (const c of items) {
        const answer = said.get(`${w.key}|${store}|${c.item_id}`);
        if (answer === false) continue;
        let top: { score: number; status: "same" | "ask" } | null = null;
        for (const want of wants) {
          const s = scoreCandidate(want, c);
          if (s && (!top || s.score > top.score)) top = s;
        }
        if (!top && answer !== true) continue;
        const status = answer === true ? "same" : top!.status;
        const score = answer === true ? 2 : top!.score;
        const m: OnlineMatch = { store, storeName: STORES[store].name, itemId: c.item_id, name: c.name, size: c.size_text, price: c.price, url: c.url, fetchedAt: c.fetched_at, status, confirmed: answer === true, score };
        // better score wins; on a tie the lower price (a "same" product is the same thing, so the cheaper listing is the useful one)
        if (!best || m.score > best.score || (m.score === best.score && m.price < best.price)) best = m;
      }
      if (best) found.push(best);
    }
    if (found.length) out[w.key] = found.sort((a, b) => a.price - b.price);
  }
  return out;
}

/** What the card says: the cheapest sure online price against the best price you paid. */
export type OnlineVerdict = { cheaper: OnlineMatch | null; savingAmount: number; savingPct: number; dearer: OnlineMatch | null; extraPct: number };
export function compareOnline(paid: number, matches: OnlineMatch[]): OnlineVerdict {
  const sure = matches.filter((m) => m.status === "same").sort((a, b) => a.price - b.price);
  const low = sure[0] ?? null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  if (!low || paid <= 0) return { cheaper: null, savingAmount: 0, savingPct: 0, dearer: low, extraPct: low && paid > 0 ? round1(((low.price - paid) / paid) * 100) : 0 };
  if (low.price < paid) return { cheaper: low, savingAmount: Math.round((paid - low.price) * 100) / 100, savingPct: round1(((paid - low.price) / paid) * 100), dearer: null, extraPct: 0 };
  return { cheaper: null, savingAmount: 0, savingPct: 0, dearer: low, extraPct: round1(((low.price - paid) / paid) * 100) };
}
