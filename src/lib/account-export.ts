import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/personal/fetch-all";
import { DOCUMENT_COLS, DOCUMENT_COLS_BASE, EXPENSE_COLS, GROCERY_ITEM_COLS, GROCERY_RECEIPT_COLS, GROCERY_RECEIPT_COLS_BASE, PRICE_CHECK_COLS, SAVINGS_PLAN_COLS, SAVINGS_EVENT_COLS, LOYALTY_CARD_COLS, LOYALTY_CARD_COLS_BASE, PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS, PERSONAL_SPEND_COLS, PERSONAL_SPEND_COLS_BASE, PERSONAL_SPEND_COLS_MID, SUBSCRIPTION_COLS, TRIP_COLS, BUDGET_COLS, UTILITY_BILL_COLS, TRIP_COLS_BASE, withColumnFallback, withColumnFallback3 } from "@/lib/columns";

/** Tables that belong to one person (column holding the owner), and the storage bucket their files sit in. */
export const EXPORT_TABLES: { table: string; owner: string; bucket?: string; cols: string; mid?: string; base?: string; /** a column that puts the rows in a fixed order, so paging never skips or repeats one */ order?: string }[] = [
  { table: "profiles", owner: "id", cols: "id, email, first_name, last_name, full_name, title, company_name, avatar_url, role, home_country, home_city, home_lat, home_lng", base: "id, email, first_name, last_name, full_name, title, company_name, avatar_url, role" },
  { table: "trips", owner: "user_id", cols: `${TRIP_COLS}, user_id, created_at`, base: `${TRIP_COLS_BASE}, user_id, created_at` },
  { table: "expenses", owner: "user_id", bucket: "receipts", cols: `${EXPENSE_COLS}, user_id, trip_id, created_at` },
  { table: "personal_projects", owner: "user_id", cols: PERSONAL_PROJECT_COLS },
  { table: "personal_expenses", owner: "user_id", bucket: "receipts", cols: PERSONAL_EXPENSE_COLS },
  { table: "utility_bills", owner: "user_id", bucket: "receipts", cols: UTILITY_BILL_COLS },
  { table: "personal_budgets", owner: "user_id", cols: BUDGET_COLS },
  { table: "savings_plans", owner: "user_id", cols: SAVINGS_PLAN_COLS },
  { table: "savings_events", owner: "user_id", cols: SAVINGS_EVENT_COLS },
  { table: "personal_spends", owner: "user_id", bucket: "receipts", cols: PERSONAL_SPEND_COLS, mid: PERSONAL_SPEND_COLS_MID, base: PERSONAL_SPEND_COLS_BASE },
  { table: "utility_prefs", owner: "user_id", cols: "user_id, remind_day", order: "user_id" },
  { table: "subscriptions", owner: "user_id", cols: SUBSCRIPTION_COLS },
  { table: "grocery_receipts", owner: "user_id", bucket: "receipts", cols: GROCERY_RECEIPT_COLS, base: GROCERY_RECEIPT_COLS_BASE },
  { table: "shopping_list_items", owner: "user_id", cols: "id, product_key, name, qty, created_at" },
  { table: "store_locations", owner: "user_id", cols: "id, name, lat, lng, source, osm_id, created_at" },
  { table: "price_checks", owner: "user_id", bucket: "receipts", cols: PRICE_CHECK_COLS },
  { table: "grocery_items", owner: "user_id", cols: `${GROCERY_ITEM_COLS}, receipt_id` },
  { table: "loyalty_cards", owner: "user_id", bucket: "loyalty-cards", cols: LOYALTY_CARD_COLS, base: LOYALTY_CARD_COLS_BASE },
  { table: "travel_documents", owner: "user_id", bucket: "documents", cols: DOCUMENT_COLS, base: DOCUMENT_COLS_BASE },
];

/** Only files inside my own folder are ever fetched, whatever a row says. */
export const isOwnPath = (path: unknown, userId: string): path is string =>
  typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..");

export function filePathsOf(rows: Record<string, unknown>[], userId: string): string[] {
  const out = new Set<string>();
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (k.endsWith("_path") && isOwnPath(v, userId)) out.add(v);
  return [...out];
}

export type ExportProgress = { step: string; done: number; total: number };

/** Builds one ZIP in the browser: a JSON file per table, the photos, and the sharing history. Returns the ZIP and a count per table. */
export async function buildAccountZip(
  supabase: SupabaseClient,
  userId: string,
  onProgress: (p: ExportProgress) => void = () => {},
): Promise<{ blob: Blob; counts: Record<string, number>; missingFiles: number }> {
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  const jobs: { bucket: string; path: string }[] = [];

  for (const [i, t] of EXPORT_TABLES.entries()) {
    onProgress({ step: `Reading ${t.table.replace(/_/g, " ")}`, done: i, total: EXPORT_TABLES.length });
    // Explicit owner filter: an admin's row-level rules may show other people's rows too
    // Page through every row (the server returns at most 1000 at a time), in a fixed order so none is skipped or repeated
    let rows: Record<string, unknown>[];
    try {
      rows = (await fetchAll<Record<string, unknown>>((from, to) => {
        const run = (cols: string) => supabase.from(t.table).select(cols).eq(t.owner, userId).order(t.order ?? "id").range(from, to);
        return (t.mid ? withColumnFallback3(run, t.cols, t.mid, t.base ?? t.cols) : withColumnFallback(run, t.cols, t.base ?? t.cols)) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      }, 1000, 200000));
    } catch { counts[t.table] = 0; continue; } // a table this install does not have
    counts[t.table] = rows.length;
    zip.file(`data/${t.table}.json`, JSON.stringify(rows, null, 2));
    if (t.bucket) for (const path of filePathsOf(rows, userId)) jobs.push({ bucket: t.bucket, path });
  }

  const { data: activity } = await supabase.rpc("sharing_activity_export");
  if (Array.isArray(activity)) { zip.file("data/sharing_activity.json", JSON.stringify(activity, null, 2)); counts.sharing_activity = activity.length; }

  let missing = 0;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const { data, error } = await supabase.storage.from(j.bucket).download(j.path);
      if (error || !data) missing++; else zip.file(`files/${j.bucket}/${j.path.slice(userId.length + 1)}`, data);
      onProgress({ step: "Adding photos", done: ++done, total: jobs.length });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  zip.file("README.txt", `Your Lifolio data, exported ${new Date().toISOString()}.\n\ndata/   one JSON file per kind of record\nfiles/  your photos and documents\n${missing ? `\n${missing} file(s) could not be fetched and are not included.\n` : ""}`);
  onProgress({ step: "Packing your download", done: 1, total: 1 });
  return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), counts, missingFiles: missing };
}
