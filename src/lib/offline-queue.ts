/**
 * Offline-first receipt capture.
 *
 * An expense that cannot be saved right now (no signal, or the request failed on the network) is kept on the device
 * in IndexedDB together with its photo, and sent later. Three rules keep that safe:
 *
 *  - Every expense gets its id on the phone. The same id is used for the database row and for the photo's file name,
 *    so sending it twice (a retry, two tabs, a lost reply) can never create a duplicate: "already exists" means done.
 *  - Items belong to the person who captured them. They are only ever sent while that same person is signed in, and
 *    the database still applies its own row-level rules when they arrive.
 *  - A failure that retrying cannot fix (the trip was deleted, access was removed) is shown to the person instead of
 *    being retried forever.
 */

import { enqueue, newId, runOutbox, syncOutbox, type Handlers, type OutboxItem, type OutboxStore, type PushOutcome as Outcome, type SyncResult } from "@/lib/outbox";

export { browserOutbox as browserStore, QUEUE_EVENT } from "@/lib/outbox";
export type { QueueStatus, SyncResult } from "@/lib/outbox";

export const EXPENSE_KIND = "expense.create";

/** An expense you already saved that looks like the one being added. */
export interface DuplicateMatch {
  id: string;
  tripId: string;
  tripName: string | null;
  merchant: string | null;
  amount: number;
  currency: string | null;
  expenseDate: string;
  reason: "same_photo" | "same_details" | "both";
}

export interface QueuedExpense extends OutboxItem {
  kind: typeof EXPENSE_KIND;
  tripId: string;
  merchant: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountUsd: number;
  category: string;
  expenseDate: string;
  notes: string | null;
  image: Blob | null;
  imageName: string | null;
  /** Fingerprint of the photo (see image-hash.ts), or null. */
  imageHash?: string | null;
  /** The person looked at the possible duplicates and chose to keep this one. */
  duplicateOk?: boolean;
  /** What it looked like a duplicate of, kept so the Waiting page can show it. */
  duplicates?: DuplicateMatch[];
  /** True once the photo is in storage, so a retry does not upload it again. */
  uploaded: boolean;
}

export const isExpense = (i: OutboxItem): i is QueuedExpense => i.kind === EXPENSE_KIND;

export type ErrorKind = "network" | "auth" | "duplicate" | "conflict" | "failed";

type ErrorLike = { message?: string; code?: string; statusCode?: string | number; status?: number; name?: string };

/** Decides what a Supabase / fetch error means for the queue. */
export function classifyError(err: unknown): ErrorKind {
  const e = (err ?? {}) as ErrorLike;
  const msg = String(e.message ?? err ?? "");
  const code = e.code ? String(e.code) : "";
  const status = String(e.statusCode ?? e.status ?? "");

  if (code === "23505" || status === "409" || /already exists|duplicate/i.test(msg)) return "duplicate";
  if (code === "23503" || code === "42501" || status === "403" || /row-level security|foreign key|not allowed|permission denied/i.test(msg)) return "conflict";
  if (/jwt expired|invalid jwt|not authenticated|auth session missing/i.test(msg) || code === "PGRST301" || status === "401") return "auth";
  const looksLikeNetwork = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|timeout|timed out/i.test(msg);
  if (looksLikeNetwork || (!code && !status && /fetch/i.test(msg))) return "network";
  return "failed";
}

export const newExpenseId = newId;

const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

/** Same path whether the photo is sent now or from the queue; the first folder is the owner, as the storage rules require. */
export function receiptPathFor(userId: string, tripId: string, id: string, blob: Blob, name?: string | null): string {
  const fromName = name && name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const ext = EXT_BY_TYPE[blob.type] || fromName || "jpg";
  return `${userId}/${tripId}/${id}.${ext}`;
}

/** What the sync needs from the outside world. Kept small so tests can fake it. */
export interface SyncApi {
  /** The signed-in user, checked with the server. `offline` when the check could not reach it. */
  currentUser(): Promise<{ userId: string | null; offline: boolean }>;
  upload(path: string, blob: Blob): Promise<{ error: unknown | null }>;
  insertExpense(row: Record<string, unknown>): Promise<{ error: unknown | null }>;
  /** Asks the database for this person's expenses that look the same. Left out where the check does not apply. */
  findDuplicates?(item: QueuedExpense): Promise<{ matches: DuplicateMatch[]; error: unknown | null }>;
}

export type QueueStore = OutboxStore<QueuedExpense>;

export type PushOutcome = Outcome<DuplicateMatch>;


function friendly(kind: ErrorKind, err: unknown): string {
  const raw = (err as ErrorLike | null)?.message || "Unknown error";
  if (kind === "conflict") {
    if (/foreign key/i.test(raw)) return "The trip this receipt belongs to no longer exists.";
    return "You no longer have permission to add this receipt.";
  }
  return raw;
}

/** Sends one expense (photo first, then the row). Safe to repeat. Updates `item` with what it learned. */
export async function pushExpense(api: SyncApi, item: QueuedExpense): Promise<PushOutcome> {
  // Look for a receipt that was already claimed, unless the person has already said "keep it".
  if (!item.duplicateOk && api.findDuplicates) {
    const { matches, error } = await api.findDuplicates(item);
    if (error) {
      const kind = classifyError(error);
      if (kind === "network" || kind === "auth") return { kind: "offline" };
      // Any other problem (for example the database update has not been run yet) must never stop a receipt from being saved.
    } else if (matches.length > 0) {
      return { kind: "duplicate", matches };
    }
  }

  let path: string | null = null;
  if (item.image) {
    path = receiptPathFor(item.userId, item.tripId, item.id, item.image, item.imageName);
    if (!item.uploaded) {
      const { error } = await api.upload(path, item.image);
      if (error) {
        const kind = classifyError(error);
        if (kind === "network" || kind === "auth") return { kind: "offline" };
        if (kind !== "duplicate") return kind === "conflict" ? { kind: "conflict", message: friendly(kind, error) } : { kind: "failed", message: friendly(kind, error) };
      }
      item.uploaded = true;
    }
  }

  const { error } = await api.insertExpense({
    id: item.id,
    trip_id: item.tripId,
    user_id: item.userId,
    merchant: item.merchant,
    amount: item.amount,
    currency: item.currency,
    exchange_rate: item.exchangeRate,
    amount_usd: item.amountUsd,
    category: item.category,
    expense_date: item.expenseDate,
    notes: item.notes,
    receipt_path: path,
    image_hash: item.imageHash ?? null,
  });
  if (!error) return { kind: "synced" };
  const kind = classifyError(error);
  if (kind === "duplicate") return { kind: "synced" }; // an earlier attempt already got it in
  if (kind === "network" || kind === "auth") return { kind: "offline" };
  return kind === "conflict" ? { kind: "conflict", message: friendly(kind, error) } : { kind: "failed", message: friendly(kind, error) };
}

/** The sending steps this file knows about, by kind. More kinds are added in offline-api.ts as they are built. */
export const expenseHandlers = (api: SyncApi): Handlers<QueuedExpense> => ({ [EXPENSE_KIND]: (item) => pushExpense(api, item) });

/** Sends every waiting receipt for `userId` (the expense-only entry point; the app uses the full outbox). */
export function runSync(store: QueueStore, api: SyncApi, userId: string): Promise<SyncResult> {
  return runOutbox(store, expenseHandlers(api), () => api.currentUser(), userId);
}

/** Keeps a new expense on the device. Resolves false if the browser would not store it (private mode, storage full). */
export const enqueueExpense = (item: QueuedExpense): Promise<boolean> => enqueue(item);

export { syncOutbox };
