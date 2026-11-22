import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { productWords } from "@/lib/personal/price-compare";
import { matchProducts, searchCatalog, staleDays, STORE_IDS, STORES, type Answer, type CatalogItem, type StoreId } from "@/lib/store-prices";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 120;
const PAGE = 1000; // the database returns at most 1000 rows per request
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rows: (Omit<CatalogItem, "store"> & { store: string })[] }>();

/** Every row of the shops' lists (they are public and the same for everyone signed in), read in pages and kept for ten minutes. */
async function loadCatalog(supabase: Awaited<ReturnType<typeof createClient>>, enabled: StoreId[]): Promise<CatalogItem[]> {
  const now = Date.now();
  const rows: (Omit<CatalogItem, "store"> & { store: string })[] = [];
  for (const store of enabled) {
    const hit = cache.get(store);
    if (hit && now - hit.at < CACHE_MS) { rows.push(...hit.rows); continue; }
    const got: (Omit<CatalogItem, "store"> & { store: string })[] = [];
    for (let from = 0; from < 30000; from += PAGE) {
      const { data, error } = await supabase.from("store_catalog").select("store, item_id, name, size_text, price, url, fetched_at").eq("store", store).order("item_id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      got.push(...((data ?? []) as typeof got));
      if (!data || data.length < PAGE) break;
    }
    cache.set(store, { at: now, rows: got });
    rows.push(...got);
  }
  return rows
    .filter((r) => (STORE_IDS as string[]).includes(r.store) && Date.parse(r.fetched_at) >= now - staleDays(r.store as StoreId) * 86400000) as CatalogItem[];
}

/** A search or list item that found nothing in any shop is counted, so the admin can see what the matching misses. */
async function logMiss(supabase: Awaited<ReturnType<typeof createClient>>, text: string, kind: "search" | "list") {
  try { await supabase.rpc("log_search_miss", { p_q: text.slice(0, 120), p_kind: kind }); } catch { /* the log is best effort */ }
}

/**
 * For the things you bought: the matching product in each online shop, from the daily copy of their lists.
 * Only your own purchases' names are used; nothing leaves the server.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`storeprices:${user.id}`, 240, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { products?: { key?: unknown; names?: unknown }[]; search?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const wanted = (Array.isArray(body.products) ? body.products : []).slice(0, MAX_PRODUCTS).flatMap((p) => {
    const key = typeof p.key === "string" ? p.key.slice(0, 300) : "";
    const names = (Array.isArray(p.names) ? p.names : []).filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 160)).slice(0, 6);
    return key && names.length ? [{ key, names }] : [];
  });
  const search = typeof body.search === "string" ? body.search.trim().slice(0, 120) : "";
  if (wanted.length === 0 && !search) return NextResponse.json({ matches: {}, stores: [] });

  const [prefsRes, answersRes] = await Promise.all([
    supabase.from("grocery_online_prefs").select("stores").eq("user_id", user.id).maybeSingle(),
    supabase.from("grocery_online_matches").select("product_key, store, item_id, same").eq("user_id", user.id),
  ]);
  const saved = (prefsRes.data?.stores as string[] | undefined) ?? STORE_IDS;
  const enabled = STORE_IDS.filter((s) => saved.includes(s));

  // The shops' lists are small (a few thousand products), so the whole list of each enabled shop is scored: nothing is missed by a pre-filter
  if (!search && wanted.every((w) => w.names.every((n) => productWords(n).length === 0))) return NextResponse.json({ matches: {}, results: [], stores: enabled.map((s) => ({ id: s, name: STORES[s].name })), enabled });
  if (enabled.length === 0) return NextResponse.json({ matches: {}, results: [], stores: [], enabled });
  let catalog: CatalogItem[];
  try { catalog = await loadCatalog(supabase, enabled); } catch (e) {
    const missing = /relation|schema cache|does not exist/i.test(e instanceof Error ? e.message : String(e));
    return NextResponse.json({ matches: {}, stores: [], enabled, setup: missing ? "migration" : "error" });
  }

  // When did each shop last answer? (an empty catalog means the daily job has not run yet)
  const { data: fresh } = await supabase.from("store_catalog").select("store, fetched_at").in("store", enabled).order("fetched_at", { ascending: false }).limit(50);
  const lastBy: Partial<Record<StoreId, string>> = {};
  for (const r of fresh ?? []) if (!lastBy[r.store as StoreId]) lastBy[r.store as StoreId] = r.fetched_at as string;

  if (search) {
    const results = searchCatalog(search, catalog, enabled);
    if (results.length === 0 && catalog.length > 0) await logMiss(supabase, search, "search");
    return NextResponse.json({ results, enabled }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const matches = matchProducts(wanted, catalog, (answersRes.data ?? []) as Answer[], enabled);
  if (catalog.length > 0) await Promise.all(wanted.slice(0, 5).filter((w) => !matches[w.key] && w.names[0]).map((w) => logMiss(supabase, w.names[0], "list")));
  return NextResponse.json({
    matches,
    enabled,
    stores: enabled.map((s) => ({ id: s, name: STORES[s].name, site: STORES[s].site, checkedAt: lastBy[s] ?? null })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
