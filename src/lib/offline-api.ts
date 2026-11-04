import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyError, type DuplicateMatch, type QueuedExpense, type SyncApi } from "@/lib/offline-queue";

type DuplicateRow = {
  id: string;
  trip_id: string;
  trip_name: string | null;
  merchant: string | null;
  amount: number | string;
  currency: string | null;
  expense_date: string;
  reason: DuplicateMatch["reason"];
};

/** Connects the offline queue to Supabase. Everything goes through the signed-in person's own session. */
export function makeSyncApi(supabase: SupabaseClient): SyncApi {
  return {
    async currentUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        const kind = classifyError(error);
        // No session at all means nobody is signed in; a network or token problem means "try again later".
        if (kind === "network" || kind === "auth") return { userId: null, offline: true };
        return { userId: null, offline: false };
      }
      return { userId: data.user?.id ?? null, offline: false };
    },
    async upload(path, blob) {
      const { error } = await supabase.storage.from("receipts").upload(path, blob, { cacheControl: "3600", upsert: false, contentType: blob.type || undefined });
      return { error };
    },
    async insertExpense(row) {
      const first = await supabase.from("expenses").insert(row);
      // The photo fingerprint column comes from the duplicate-detection SQL update. If that has not been run yet, save without it.
      if (first.error && "image_hash" in row && /image_hash/i.test(first.error.message || "")) {
        const { image_hash: _unused, ...rest } = row;
        void _unused;
        const retry = await supabase.from("expenses").insert(rest);
        return { error: retry.error };
      }
      return { error: first.error };
    },
    async findDuplicates(item: QueuedExpense) {
      // The check runs inside the database (find_duplicate_expenses) as the signed-in person, so it only ever sees their own expenses.
      const { data, error } = await supabase.rpc("find_duplicate_expenses", {
        p_merchant: item.merchant,
        p_amount: item.amount,
        p_currency: item.currency,
        p_date: item.expenseDate,
        p_image_hash: item.imageHash ?? null,
      });
      if (error) return { matches: [], error };
      const matches = ((data ?? []) as DuplicateRow[]).map((r) => ({
        id: r.id,
        tripId: r.trip_id,
        tripName: r.trip_name,
        merchant: r.merchant,
        amount: Number(r.amount),
        currency: r.currency,
        expenseDate: r.expense_date,
        reason: r.reason,
      }));
      return { matches, error: null };
    },
  };
}
