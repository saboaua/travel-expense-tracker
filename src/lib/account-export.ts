import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_COLS, DOCUMENT_COLS_BASE, EXPENSE_COLS, GROCERY_ITEM_COLS, GROCERY_RECEIPT_COLS, LOYALTY_CARD_COLS, LOYALTY_CARD_COLS_BASE, PERSONAL_EXPENSE_COLS, PERSONAL_PROJECT_COLS, PERSONAL_SPEND_COLS, TRIP_COLS, TRIP_COLS_BASE, withColumnFallback } from "@/lib/columns";

/** Tables that belong to one person (column holding the owner), and the storage bucket their files sit in. */
export const EXPORT_TABLES: { table: string; owner: string; bucket?: string; cols: string; base?: string }[] = [
  { table: "profiles", owner: "id", cols: "id, email, first_name, last_name, full_name, title, company_name, avatar_url, role, home_country, home_city", base: "id, email, first_name, last_name, full_name, title, company_name, avatar_url, role" },
  { table: "trips", owner: "user_id", cols: `${TRIP_COLS}, user_id, created_at`, base: `${TRIP_COLS_BASE}, user_id, created_at` },
  { table: "expenses", owner: "user_id", bucket: "receipts", cols: `${EXPENSE_COLS}, user_id, trip_id, created_at` },
  { table: "personal_projects", owner: "user_id", cols: PERSONAL_PROJECT_COLS },
  { table: "personal_expenses", owner: "user_id", bucket: "receipts", cols: PERSONAL_EXPENSE_COLS },
  { table: "personal_spends", owner: "user_id", cols: PERSONAL_SPEND_COLS },
  { table: "grocery_receipts", owner: "user_id", bucket: "receipts", cols: GROCERY_RECEIPT_COLS },
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
    const { data, error } = await withColumnFallback((cols) => supabase.from(t.table).select(cols).eq(t.owner, userId).limit(100000), t.cols, t.base ?? t.cols);
    if (error) { counts[t.table] = 0; continue; } // a table this install does not have
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
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
