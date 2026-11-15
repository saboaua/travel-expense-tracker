/** Things that happen when Pro comes on for someone: the bills that waited by email are added. Best effort; never blocks the admin. Server only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseHeldBills } from "@/lib/bill-email-inbound";
import { sendPush } from "@/lib/push";

export async function onProOn(db: SupabaseClient, userId: string): Promise<void> {
  try {
    await releaseHeldBills(db, userId, (uid, b) => sendPush(uid, "billEmail", "reminders", { item: b.company, label: b.month, date: b.due ?? undefined }));
  } catch (e) { console.error("[pro-on]", e instanceof Error ? e.message : e); }
}
