/**
 * The morning check for price watches. Server only. For everyone with an active watch it looks at the prices they have seen at their own
 * stores, the Super Food Plaza / Ling & Sons / Do it lists and the community prices, and sends at most one message a morning. Each
 * source that cannot be read is left out, so a problem with one never stops the others.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimOnce, sendPush } from "@/lib/push";
import { fetchPriceMatches, fetchPrices } from "@/lib/offline-grocery";
import { buildProducts, type Product } from "@/lib/personal/price-compare";
import { decide, hitsMessage, ownOffers, readWatch, WATCH_COLS, type Watch, type WatchOffer } from "@/lib/personal/price-watch";
import { matchProducts, ONLINE_CURRENCY, staleDays, STORE_IDS, type Answer, type CatalogItem, type StoreId } from "@/lib/store-prices";

const missing = (m: string) => /does not exist|schema cache/i.test(m);
const PAGE = 1000;

/** Every fresh row of the shops' lists (they are public and the same for everyone), or nothing when they cannot be read. */
async function loadCatalog(db: SupabaseClient): Promise<CatalogItem[]> {
  try {
    const now = Date.now();
    const rows: CatalogItem[] = [];
    for (const store of STORE_IDS) {
      for (let from = 0; from < 30000; from += PAGE) {
        const { data, error } = await db.from("store_catalog").select("store, item_id, name, size_text, price, url, fetched_at").eq("store", store).order("item_id").range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as unknown as (Omit<CatalogItem, "price"> & { price: number | string })[]) {
          if (Date.parse(r.fetched_at) >= now - staleDays(r.store as StoreId) * 86400000) rows.push({ ...r, price: Number(r.price) });
        }
        if (!data || data.length < PAGE) break;
      }
    }
    return rows;
  } catch (e) {
    console.error("[cron] price watch catalog", e instanceof Error ? e.message : e);
    return [];
  }
}

/** What each watch of one person can be bought for right now, from every source that could be read. */
async function offersFor(db: SupabaseClient, uid: string, watches: Watch[], catalog: CatalogItem[]): Promise<Map<string, WatchOffer[]>> {
  const out = new Map<string, WatchOffer[]>(watches.map((w) => [w.id, []]));
  const add = (w: Watch, o: WatchOffer) => out.get(w.id)!.push(o);

  // 1. prices at the person's own stores
  let products = new Map<string, Product>();
  try {
    const [rows, matches] = await Promise.all([fetchPrices(db, uid), fetchPriceMatches(db, uid)]);
    products = new Map(buildProducts(rows.data ?? [], matches.data ?? []).products.map((p) => [p.key, p]));
  } catch (e) { console.error("[cron] price watch own prices", e instanceof Error ? e.message : e); }
  for (const w of watches) { const p = products.get(w.product_key); if (p && p.currency === w.currency) for (const o of ownOffers(p)) add(w, o); }

  // 2. the online shops' lists: only products that are the same by name and size
  const online = watches.filter((w) => w.currency === ONLINE_CURRENCY);
  if (online.length && catalog.length) {
    try {
      const [answers, prefs] = await Promise.all([
        db.from("grocery_online_matches").select("product_key, store, item_id, same").eq("user_id", uid),
        db.from("grocery_online_prefs").select("stores").eq("user_id", uid).maybeSingle(),
      ]);
      const saved = (prefs.data?.stores as string[] | undefined) ?? STORE_IDS;
      const enabled = STORE_IDS.filter((s) => saved.includes(s));
      const wanted = online.map((w) => ({ key: w.product_key, names: (products.get(w.product_key)?.names.map((n) => n.name) ?? []).slice(0, 6).concat(w.name).slice(0, 6) }));
      const found = matchProducts(wanted, catalog, (answers.error ? [] : answers.data ?? []) as Answer[], enabled);
      for (const w of online) for (const m of found[w.product_key] ?? []) if (m.status === "same" && m.price > 0) add(w, { store: m.storeName, price: m.price, source: "online" });
    } catch (e) { console.error("[cron] price watch online prices", e instanceof Error ? e.message : e); }
  }

  // 3. community prices (only ones several people reported); left out when the database will not answer
  try {
    const r = await db.rpc("community_search", { keys: [...new Set(watches.map((w) => w.product_key))] });
    if (!r.error) for (const c of (r.data ?? []) as { product_key: string; currency: string; store_name: string; price: number | string }[]) {
      for (const w of watches) if (w.product_key === c.product_key && w.currency === c.currency && Number(c.price) > 0) add(w, { store: c.store_name, price: Number(c.price), source: "community" });
    }
  } catch { /* community prices are an extra */ }
  return out;
}

/** One message a morning per person. Returns how many messages went out. */
export async function priceDropAlerts(db: SupabaseClient, today: string): Promise<number> {
  const res = await db.from("price_watches").select(`user_id, ${WATCH_COLS}`).eq("paused", false).limit(20000);
  if (res.error) { if (missing(res.error.message)) return 0; throw new Error(res.error.message); }
  const byUser = new Map<string, Watch[]>();
  for (const r of (res.data ?? []) as unknown as (Record<string, unknown> & { user_id: string })[]) {
    const w = readWatch(r);
    if (w) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), w]);
  }
  if (!byUser.size) return 0;
  const catalog = await loadCatalog(db);
  let sent = 0;
  for (const [uid, watches] of byUser) {
    try {
      const offers = await offersFor(db, uid, watches, catalog);
      const hits: { w: Watch; store: string; price: number }[] = [];
      const resets: string[] = [];
      for (const w of watches) {
        const d = decide(w, offers.get(w.id) ?? []);
        if (d.action === "alert") hits.push({ w, store: d.offer.store, price: d.offer.price });
        else if (d.action === "reset") resets.push(w.id);
      }
      if (resets.length) await db.from("price_watches").update({ last_alert_price: null, last_alert_store: null }).in("id", resets).eq("user_id", uid);
      if (!hits.length) continue;
      // already told today (a second run): the drops are announced tomorrow instead of being lost
      if (!(await claimOnce(uid, `pricedrop:${today}`))) continue;
      for (const h of hits) await db.from("price_watches").update({ last_alert_price: h.price, last_alert_store: h.store, last_alert_on: today }).eq("id", h.w.id).eq("user_id", uid);
      sent += await sendPush(uid, "priceDrop", "priceDrops", hitsMessage(hits.map((h) => ({ name: h.w.name, store: h.store }))), { today });
    } catch (e) { console.error("[cron] price drop check for one person failed", e instanceof Error ? e.message : e); } // the others still get theirs
  }
  return sent;
}
