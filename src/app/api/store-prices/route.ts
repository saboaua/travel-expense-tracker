import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { productWords } from "@/lib/personal/price-compare";
import { matchProducts, STORE_IDS, STORES, type Answer, type CatalogItem, type StoreId } from "@/lib/store-prices";

export const dynamic = "force-dynamic";

const MAX_PRODUCTS = 120;
const STALE_DAYS = 7;

/**
 * For the things you bought: the matching product in each online shop, from the daily copy of their lists.
 * Only your own purchases' names are used; nothing leaves the server.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`storeprices:${user.id}`, 240, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { products?: { key?: unknown; names?: unknown }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const wanted = (Array.isArray(body.products) ? body.products : []).slice(0, MAX_PRODUCTS).flatMap((p) => {
    const key = typeof p.key === "string" ? p.key.slice(0, 300) : "";
    const names = (Array.isArray(p.names) ? p.names : []).filter((n): n is string => typeof n === "string").map((n) => n.slice(0, 160)).slice(0, 6);
    return key && names.length ? [{ key, names }] : [];
  });
  if (wanted.length === 0) return NextResponse.json({ matches: {}, stores: [] });

  const [prefsRes, answersRes] = await Promise.all([
    supabase.from("grocery_online_prefs").select("stores").eq("user_id", user.id).maybeSingle(),
    supabase.from("grocery_online_matches").select("product_key, store, item_id, same").eq("user_id", user.id),
  ]);
  const saved = (prefsRes.data?.stores as string[] | undefined) ?? STORE_IDS;
  const enabled = STORE_IDS.filter((s) => saved.includes(s));

  // The shops' lists are small enough to read the rows that share a word with something you bought
  const keyWords = [...new Set(wanted.flatMap((w) => w.names.map((n) => [...productWords(n)].sort((a, b) => b.length - a.length)[0]).filter((x): x is string => !!x && x.length >= 3)))].slice(0, 150);
  if (keyWords.length === 0 || enabled.length === 0) return NextResponse.json({ matches: {}, stores: enabled.map((s) => ({ id: s, name: STORES[s].name })), enabled });
  const orFilter = keyWords.map((w) => `name_norm.ilike.%${w.replace(/[^a-z0-9]/g, "")}%`).join(",");
  const { data, error } = await supabase.from("store_catalog").select("store, item_id, name, size_text, price, url, fetched_at").in("store", enabled).or(orFilter).limit(6000);
  if (error) {
    const missing = /relation|schema cache|does not exist/i.test(error.message);
    return NextResponse.json({ matches: {}, stores: [], enabled, setup: missing ? "migration" : "error" });
  }
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  const catalog = ((data ?? []) as (Omit<CatalogItem, "store"> & { store: string })[])
    .filter((r) => (STORE_IDS as string[]).includes(r.store) && Date.parse(r.fetched_at) >= cutoff) as CatalogItem[];

  // When did each shop last answer? (an empty catalog means the daily job has not run yet)
  const { data: fresh } = await supabase.from("store_catalog").select("store, fetched_at").in("store", enabled).order("fetched_at", { ascending: false }).limit(50);
  const lastBy: Partial<Record<StoreId, string>> = {};
  for (const r of fresh ?? []) if (!lastBy[r.store as StoreId]) lastBy[r.store as StoreId] = r.fetched_at as string;

  const matches = matchProducts(wanted, catalog, (answersRes.data ?? []) as Answer[], enabled);
  return NextResponse.json({
    matches,
    enabled,
    stores: enabled.map((s) => ({ id: s, name: STORES[s].name, site: STORES[s].site, checkedAt: lastBy[s] ?? null })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
