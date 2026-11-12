import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLing, fetchSuperFood, STORE_IDS } from "@/lib/store-prices";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Open this page while signed in: can the server read both shops, and what is saved so far? Reads one page each, saves nothing. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const probe = async (run: () => Promise<{ rows: { name: string; price: number; size_text: string | null }[]; complete: boolean }>) => {
    const t = Date.now();
    try { const r = await run(); return { ok: r.rows.length > 0, ms: Date.now() - t, rows: r.rows.length, complete: r.complete, sample: r.rows.slice(0, 3).map((x) => `${x.name}${x.size_text ? ` (${x.size_text})` : ""} ${x.price}`) }; }
    catch (e) { return { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) }; }
  };
  const [superfood, ling] = await Promise.all([
    probe(() => fetchSuperFood(fetch, { maxPages: 1, pageSize: 25 })),
    probe(() => fetchLing(fetch, { maxPages: 1, pageSize: 25 })),
  ]);

  const saved: Record<string, { rows: number; newest: string | null } | string> = {};
  for (const s of STORE_IDS) {
    const { count, error } = await supabase.from("store_catalog").select("item_id", { count: "exact", head: true }).eq("store", s);
    if (error) { saved[s] = /relation|schema cache|does not exist/i.test(error.message) ? "Run supabase/migration_store_prices.sql" : error.message; continue; }
    const { data } = await supabase.from("store_catalog").select("fetched_at").eq("store", s).order("fetched_at", { ascending: false }).limit(1);
    saved[s] = { rows: count ?? 0, newest: data?.[0]?.fetched_at ?? null };
  }
  return NextResponse.json({ read: { superfood, ling }, saved, note: "Saved lists are filled once a day by /api/cron/store-prices (needs CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY)." }, { headers: { "Cache-Control": "no-store" } });
}
