import { useCachedQuery } from "@/lib/use-cached-query";
import { readWatch, WATCH_COLS, type Watch } from "@/lib/personal/price-watch";

export const watchesKey = (uid: string) => `${uid}:price-watches`;

/** The person's price watches, newest first. Kept on the phone so the list opens offline. Before the migration is run there are simply none. */
export function usePriceWatches() {
  return useCachedQuery<Watch[]>(watchesKey, async (sb) => {
    const r = await sb.from("price_watches").select(WATCH_COLS).order("created_at", { ascending: false }).limit(500);
    if (r.error) return /relation|schema cache|does not exist/i.test(r.error.message) ? { data: [] as Watch[], error: null } : { data: null, error: r.error };
    return { data: ((r.data ?? []) as unknown as Record<string, unknown>[]).flatMap((x) => { const w = readWatch(x); return w ? [w] : []; }), error: null };
  }, []);
}
