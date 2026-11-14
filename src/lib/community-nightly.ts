/**
 * Community prices, shared once a night. For everyone who turned sharing on, read their latest prices and replace their shared list for
 * the month (so a corrected or deleted receipt is picked up). Only the seven allowed fields are written (see sharedRows). Runs with the
 * service key from the daily job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPriceMatches, fetchPrices } from "@/lib/offline-grocery";
import { buildProducts } from "@/lib/personal/price-compare";
import { sharedRows } from "@/lib/personal/community";
import { sendPush } from "@/lib/push";
import { readBadge, tierOf } from "@/lib/personal/badges";

export type NightlyResult = { people: number; shared: number; failed: number; alerts: number };

const MAX_PEOPLE = 150; // per night; the ones not shared for longest go first, so the rest follow the next night
const TIME_BUDGET_MS = 45_000;

export async function nightlyShare(db: SupabaseClient, now = new Date()): Promise<NightlyResult> {
  const out: NightlyResult = { people: 0, shared: 0, failed: 0, alerts: 0 };
  const started = Date.now();
  const { data: people, error } = await db.from("profiles").select("id").eq("share_prices", true).order("share_last_at", { ascending: true, nullsFirst: true }).limit(MAX_PEOPLE);
  if (error) throw new Error(error.message);
  for (const p of people ?? []) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const uid = String(p.id);
    out.people++;
    try {
      const [prices, matches] = await Promise.all([fetchPrices(db, uid), fetchPriceMatches(db, uid)]);
      if (prices.error || !prices.data) throw new Error("prices");
      const { products } = buildProducts(prices.data, matches.data ?? []);
      const rows = sharedRows(products, now);
      const r = await db.rpc("share_prices_for", { uid, rows, replace_month: true });
      if (r.error) throw new Error(r.error.message);
      out.shared += Number(r.data) || 0;
      // one phone alert when a new badge level was reached
      const claimed = await db.rpc("claim_badge_alert_for", { uid });
      const t = tierOf(Number(claimed.data) || 0);
      if (!claimed.error && t) {
        const badge = await db.rpc("my_badge_for", { uid });
        const total = badge.error ? 0 : readBadge(badge.data).total;
        out.alerts += await sendPush(uid, "badge", "badges", { item: t.name, count: total });
      }
    } catch (e) {
      out.failed++;
      console.error("[community nightly]", uid.slice(0, 8), e instanceof Error ? e.message : e);
      try { await db.rpc("share_failed_for", { uid }); } catch { /* the card just keeps its last status */ }
    }
  }
  return out;
}
