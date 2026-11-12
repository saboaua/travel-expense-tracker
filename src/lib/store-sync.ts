import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLing, fetchSuperFood, type CatalogRow, type StoreId } from "@/lib/store-prices";

export type SyncResult = { store: StoreId; fetched: number; complete: boolean; removed: number; error: string | null; ms: number };

async function saveStore(db: SupabaseClient, store: StoreId, run: () => Promise<{ rows: CatalogRow[]; complete: boolean }>): Promise<SyncResult> {
  const started = Date.now();
  const stamp = new Date().toISOString();
  try {
    const { rows, complete } = await run();
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, currency: "AWG", fetched_at: stamp }));
      const { error } = await db.from("store_catalog").upsert(chunk, { onConflict: "store,item_id" });
      if (error) throw new Error(error.message);
    }
    // Products the shop no longer lists are removed, but only after a full read, so a short read never empties the list
    let removed = 0;
    if (complete && rows.length > 0) {
      const { data, error } = await db.from("store_catalog").delete().eq("store", store).lt("fetched_at", stamp).select("item_id");
      if (error) throw new Error(error.message);
      removed = data?.length ?? 0;
    }
    return { store, fetched: rows.length, complete, removed, error: null, ms: Date.now() - started };
  } catch (e) {
    return { store, fetched: 0, complete: false, removed: 0, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

/** Reads both shops' public product lists into the shared catalog table. Run once a day by the cron. */
export async function syncStorePrices(db: SupabaseClient, fetcher: typeof fetch = fetch, budgetMs = 50000): Promise<SyncResult[]> {
  const until = Date.now() + budgetMs;
  return Promise.all([
    saveStore(db, "superfood", () => fetchSuperFood(fetcher, { until })),
    saveStore(db, "ling", () => fetchLing(fetcher, { until })),
  ]);
}
