import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyError, EXPENSE_KIND, pushExpense, type DuplicateMatch, type QueuedExpense, type SyncApi } from "@/lib/offline-queue";
import { DOCUMENT_DELETE, DOCUMENT_SAVE, makeDocumentApi, pushDocumentDelete, pushDocumentSave, type DocumentDeleteItem, type DocumentSaveItem } from "@/lib/document-outbox";
import { LOYALTY_DELETE, LOYALTY_SAVE, makeLoyaltyApi, pushLoyaltyDelete, pushLoyaltySave, type LoyaltyDeleteItem, type LoyaltySaveItem } from "@/lib/loyalty-outbox";
import type { Handlers } from "@/lib/outbox";

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

/**
 * Every kind of change the outbox can send, and how. A new kind (a trip, a card, ...) is added here with its own
 * "send" step; the engine, the sync pill and the Waiting page need no change.
 */
export function makeHandlers(supabase: SupabaseClient): Handlers {
  const api = makeSyncApi(supabase);
  const loyalty = makeLoyaltyApi(supabase);
  const documents = makeDocumentApi(supabase);
  return {
    [EXPENSE_KIND]: (item) => pushExpense(api, item as QueuedExpense),
    [LOYALTY_SAVE]: (item) => pushLoyaltySave(loyalty, item as LoyaltySaveItem),
    [LOYALTY_DELETE]: (item) => pushLoyaltyDelete(loyalty, item as LoyaltyDeleteItem),
    [DOCUMENT_SAVE]: (item) => pushDocumentSave(documents, item as DocumentSaveItem),
    [DOCUMENT_DELETE]: (item) => pushDocumentDelete(documents, item as DocumentDeleteItem),
  };
}

/** Who is signed in, checked with the server, for the outbox. */
export const currentUserOf = (supabase: SupabaseClient) => makeSyncApi(supabase).currentUser;

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
