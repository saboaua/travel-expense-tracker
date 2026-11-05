import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Telegram sends an update again when it does not get a reply in time. Returns false when this update was
 * already handled (so the caller skips it). If the table is not there yet (migration_telegram_v4.sql not run),
 * or the check fails, it returns true: better to risk a rare duplicate than to drop a real message.
 */
export async function claimUpdate(supabase: SupabaseClient, updateId: unknown): Promise<boolean> {
  if (typeof updateId !== "number" || !Number.isSafeInteger(updateId)) return true;
  const { error } = await supabase.from("telegram_updates").insert({ update_id: updateId });
  if (!error) return true;
  return error.code === "23505" ? false : true;
}

/** Old rows are not needed: Telegram only re-sends within a day. Called by the daily job. */
export async function pruneUpdates(supabase: SupabaseClient, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  await supabase.from("telegram_updates").delete().lt("received_at", cutoff);
}
