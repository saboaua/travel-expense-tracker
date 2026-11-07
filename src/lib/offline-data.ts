import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_COLS, DOCUMENT_COLS_BASE, EXPENSE_COLS, LOYALTY_CARD_COLS, LOYALTY_CARD_COLS_BASE, withColumnFallback } from "@/lib/columns";
import { DOC_BUCKET } from "@/lib/document-upload";
import type { TravelDocument } from "@/lib/documents";
import type { LoyaltyCard } from "@/lib/loyalty";
import { LOYALTY_BUCKET } from "@/lib/loyalty-image";
import { browserBlobs, browserKv, loadWithCache } from "@/lib/offline-store";
import { warmPages } from "@/lib/offline-warm";

/** The queries behind the offline screens. The screens and the background warm-up use the same ones. */

export const loyaltyKey = (userId: string) => `${userId}:loyalty`;
export const expenseKey = (userId: string, expenseId: string) => `${userId}:expense:${expenseId}`;
export const documentsKey = (userId: string, tripId: string | null) => `${userId}:documents:${tripId ?? "general"}`;

export function fetchLoyaltyCards(supabase: SupabaseClient, userId: string) {
  return withColumnFallback((cols) => supabase.from("loyalty_cards").select(cols).eq("user_id", userId), LOYALTY_CARD_COLS, LOYALTY_CARD_COLS_BASE) as unknown as PromiseLike<{ data: LoyaltyCard[] | null; error: { message: string } | null }>;
}

export function fetchDocuments(supabase: SupabaseClient, tripId: string | null) {
  return withColumnFallback(
    (cols) => {
      const q = supabase.from("travel_documents").select(cols).order("created_at", { ascending: false });
      return tripId ? q.eq("trip_id", tripId) : q.is("trip_id", null);
    },
    DOCUMENT_COLS,
    DOCUMENT_COLS_BASE
  ) as unknown as PromiseLike<{ data: TravelDocument[] | null; error: { message: string } | null }>;
}

/** Keeps a copy of one private file on the phone (skipped when it is already there). */
export async function cacheFile(supabase: SupabaseClient, bucket: string, path: string): Promise<void> {
  const key = `${bucket}/${path}`;
  try {
    if (await browserBlobs.has(key)) return;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (!data?.signedUrl) return;
    const res = await fetch(data.signedUrl);
    if (res.ok) await browserBlobs.put(key, await res.blob());
  } catch { /* the copy is a bonus */ }
}

/** Object links for the files that are saved on the phone, by path. Revoke them with `URL.revokeObjectURL` when done. */
export async function savedFileUrls(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const blob = await browserBlobs.get(`${bucket}/${p}`).catch(() => null);
    if (blob) out[p] = URL.createObjectURL(blob);
  }
  return out;
}

const MAX_FILES = 25;

/** Refreshes the offline copies: pages, cards, documents and their photos. Safe to run any time; does nothing offline. */
export async function warmOffline(supabase: SupabaseClient, userId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  await warmPages();
  const cards = await loadWithCache(browserKv, loyaltyKey(userId), () => fetchLoyaltyCards(supabase, userId));
  if (cards.ok && !cards.fromCache) {
    for (const c of cards.data) {
      if (c.image_path) await cacheFile(supabase, LOYALTY_BUCKET, c.image_path);
      if (c.back_image_path) await cacheFile(supabase, LOYALTY_BUCKET, c.back_image_path);
    }
  }
  await warmTrips(supabase, userId).catch(() => {});
  const docs = await loadWithCache(browserKv, documentsKey(userId, null), () => fetchDocuments(supabase, null));
  if (docs.ok && !docs.fromCache) {
    for (const d of docs.data.slice(0, MAX_FILES)) if (d.file_path) await cacheFile(supabase, DOC_BUCKET, d.file_path);
  }
}

const RECENT_TRIPS = 6;

/** The latest trips with their expenses: the pages, and a copy of each expense for the edit screen. */
export async function warmTrips(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: trips } = await supabase.from("trips").select("id").eq("user_id", userId).order("start_date", { ascending: false }).limit(RECENT_TRIPS);
  if (!trips?.length) return;
  const pages = ["/trips"];
  for (const t of trips) {
    pages.push(`/trips/${t.id}`);
    const { data: expenses } = await supabase.from("expenses").select(EXPENSE_COLS).eq("trip_id", t.id).order("expense_date", { ascending: false }).limit(30);
    for (const e of (expenses ?? []) as unknown as { id: string }[]) {
      await browserKv.set(expenseKey(userId, e.id), e).catch(() => {});
      if (pages.length < 40) pages.push(`/trips/${t.id}/expenses/${e.id}`);
    }
  }
  await warmPages(pages);
}
