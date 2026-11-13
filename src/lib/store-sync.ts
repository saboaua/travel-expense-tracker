import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogProblems, fetchLing, fetchSuperFood, type CatalogRow, type StoreId } from "@/lib/store-prices";

export type SyncResult = { store: StoreId; fetched: number; complete: boolean; removed: number; error: string | null; ms: number; skipped?: number; problem?: string | null };

/** Saves rows in chunks. A chunk the database refuses is retried in small pieces, so one bad row only skips itself. */
async function upsertRows(db: SupabaseClient, rows: Record<string, unknown>[]): Promise<{ skipped: number; firstError: string | null }> {
  let skipped = 0, firstError: string | null = null;
  const put = async (chunk: Record<string, unknown>[], size: number): Promise<void> => {
    const { error } = await db.from("store_catalog").upsert(chunk, { onConflict: "store,item_id" });
    if (!error) return;
    firstError = firstError ?? error.message;
    if (chunk.length <= 1) { skipped += chunk.length; return; }
    for (let i = 0; i < chunk.length; i += size) await put(chunk.slice(i, i + size), Math.max(1, Math.floor(size / 5)));
  };
  for (let i = 0; i < rows.length; i += 500) await put(rows.slice(i, i + 500), 100);
  return { skipped, firstError };
}

async function saveStore(db: SupabaseClient, store: StoreId, run: () => Promise<{ rows: CatalogRow[]; complete: boolean; error?: string }>): Promise<SyncResult> {
  const started = Date.now();
  const stamp = new Date().toISOString();
  try {
    const read = await run();
    const good = read.rows.filter((r) => !catalogProblems(r));
    const bad = read.rows.length - good.length;
    const { skipped, firstError } = await upsertRows(db, good.map((r) => ({ ...r, currency: "AWG", fetched_at: stamp })));
    // Products the shop no longer lists are removed, but only after a full, clean read, so a short read never empties the list
    let removed = 0;
    if (read.complete && good.length > 0 && skipped === 0) {
      const { data, error } = await db.from("store_catalog").delete().eq("store", store).lt("fetched_at", stamp).select("item_id");
      if (error) throw new Error(error.message);
      removed = data?.length ?? 0;
    }
    const problem = [read.error, bad ? `${bad} rows the database limits would refuse` : null, skipped ? `${skipped} rows refused: ${firstError}` : null].filter(Boolean).join("; ") || null;
    return { store, fetched: good.length - skipped, complete: read.complete, removed, error: good.length === 0 ? (problem ?? "the shop returned no products") : null, ms: Date.now() - started, skipped: skipped + bad, problem };
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
