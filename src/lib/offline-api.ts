import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyError, type SyncApi } from "@/lib/offline-queue";

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
      const { error } = await supabase.from("expenses").insert(row);
      return { error };
    },
  };
}
