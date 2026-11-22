import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { applyVerdicts, judgeConfigured, judgePairs, MAX_JUDGED, pairKey, type Pair, type Verdict } from "@/lib/match-judge";
import { productWords } from "@/lib/personal/price-compare";
import { matchProducts, searchCatalog, staleDays, STORE_IDS, STORES, type Answer, type CatalogItem, type OnlineMatch, type StoreId } from "@/lib/store-prices";

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

/**
 * Doubtful matches (status "ask") are judged by the AI once and the verdict is kept for everyone. Nothing here can fail the request:
 * with no AI set up, no answer, or no table, the matches simply stay as the word matcher left them.
 */
async function judgeDoubtful(supabase: Awaited<ReturnType<typeof createClient>>, items: { wanted: string; matches: OnlineMatch[] }[]): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  if (!judgeConfigured()) return verdicts;
  const pairs = new Map<string, Pair>();
  for (const it of items) for (const m of it.matches) if (m.status === "ask" && !m.confirmed) pairs.set(pairKey({ wanted: it.wanted, shop: m.name }), { wanted: it.wanted, shop: m.name });
  if (pairs.size === 0) return verdicts;
  try {
    const keys = [...pairs.keys()];
    const { data } = await supabase.from("product_match_cache").select("pair_key, same").in("pair_key", keys);
    for (const r of (data ?? []) as { pair_key: string; same: boolean }[]) verdicts.set(r.pair_key, { same: r.same });
    const todo = keys.filter((k) => !verdicts.has(k)).slice(0, MAX_JUDGED);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (todo.length && url && service) {
      const answers = await judgePairs(todo.map((k) => pairs.get(k)!));
      if (answers) {
        todo.forEach((k, i) => verdicts.set(k, { same: answers[i] }));
        const db = createServiceClient(url, service, { auth: { persistSession: false } });
        await db.from("product_match_cache").upsert(todo.map((k, i) => ({ pair_key: k, same: answers[i] })), { onConflict: "pair_key" });
      }
    }
  } catch { /* judging is an extra; the matches stay as they are */ }
  return verdicts;
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
    let results = searchCatalog(search, catalog, enabled);
    results = applyVerdicts(search, results, await judgeDoubtful(supabase, [{ wanted: search, matches: results }]));
    if (results.length === 0 && catalog.length > 0) await logMiss(supabase, search, "search");
    return NextResponse.json({ results, enabled }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const matches = matchProducts(wanted, catalog, (answersRes.data ?? []) as Answer[], enabled);
  const verdicts = await judgeDoubtful(supabase, wanted.map((w) => ({ wanted: w.names[0], matches: matches[w.key] ?? [] })));
  if (verdicts.size) for (const w of wanted) if (matches[w.key]) { const kept = applyVerdicts(w.names[0], matches[w.key], verdicts); if (kept.length) matches[w.key] = kept; else delete matches[w.key]; }
  if (catalog.length > 0) await Promise.all(wanted.slice(0, 5).filter((w) => !matches[w.key] && w.names[0]).map((w) => logMiss(supabase, w.names[0], "list")));
  return NextResponse.json({
    matches,
    enabled,
    stores: enabled.map((s) => ({ id: s, name: STORES[s].name, site: STORES[s].site, checkedAt: lastBy[s] ?? null })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
