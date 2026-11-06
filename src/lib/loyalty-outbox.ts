import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/columns";
import type { LoyaltyCard } from "@/lib/loyalty";
import { BACK_MIGRATION_MESSAGE, LOYALTY_BUCKET, rowOf, type CardInput, type Photo } from "@/lib/loyalty-image";
import { classifyError } from "@/lib/offline-queue";
import { newId, type OutboxItem, type OutboxStore, type PushOutcome } from "@/lib/outbox";

/**
 * Saving and deleting loyalty cards, online or off. Both go through the outbox: tried right away, and kept on the
 * phone to be sent later if there is no connection. The card id is made on the phone and is the database id, so a
 * repeat is harmless. A card has one waiting item at a time (the item id is the card id): the latest wish wins.
 */

export const LOYALTY_SAVE = "loyalty.save";
export const LOYALTY_DELETE = "loyalty.delete";

type CardRow = ReturnType<typeof rowOf>;

export interface LoyaltySaveItem extends OutboxItem {
  kind: typeof LOYALTY_SAVE;
  /** Not in the database yet. */
  isNew: boolean;
  row: CardRow;
  /** Photo paths to store on the card: a path, null (no photo) or undefined (leave as it is). */
  frontPath?: string | null;
  backPath?: string | null;
  /** The photos to upload, until they are uploaded. */
  frontBlob?: Blob | null;
  backBlob?: Blob | null;
  frontUploaded?: boolean;
  backUploaded?: boolean;
  /** Files that stop being used once the card is saved. */
  oldPaths: string[];
}

export interface LoyaltyDeleteItem extends OutboxItem {
  kind: typeof LOYALTY_DELETE;
  paths: string[];
}

export const isLoyaltySave = (i: OutboxItem): i is LoyaltySaveItem => i.kind === LOYALTY_SAVE;
export const isLoyaltyDelete = (i: OutboxItem): i is LoyaltyDeleteItem => i.kind === LOYALTY_DELETE;

/** What the handlers need from the outside world. Kept small so tests can fake it. */
export interface LoyaltyApi {
  upload(path: string, blob: Blob): Promise<{ error: unknown | null }>;
  /** Inserts or updates the card. */
  upsert(row: Record<string, unknown>): Promise<{ error: unknown | null }>;
  deleteRow(id: string): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<void>;
}

export function makeLoyaltyApi(supabase: SupabaseClient): LoyaltyApi {
  return {
    async upload(path, blob) {
      const { error } = await supabase.storage.from(LOYALTY_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      return { error };
    },
    async upsert(row) {
      const { error } = await supabase.from("loyalty_cards").upsert(row, { onConflict: "id" });
      return { error };
    },
    async deleteRow(id) {
      const { error } = await supabase.from("loyalty_cards").delete().eq("id", id);
      return { error };
    },
    async remove(paths) {
      if (paths.length) await supabase.storage.from(LOYALTY_BUCKET).remove(paths).catch(() => {});
    },
  };
}

const fail = (error: unknown): PushOutcome => {
  const k = classifyError(error);
  const message = (error as { message?: string } | null)?.message || "Could not save the card.";
  if (k === "network" || k === "auth") return { kind: "offline" };
  return k === "conflict" ? { kind: "conflict", message: "You no longer have permission to change this card." } : { kind: "failed", message };
};

/** Sends one waiting card. Safe to repeat. */
export async function pushLoyaltySave(api: LoyaltyApi, item: LoyaltySaveItem): Promise<PushOutcome> {
  for (const side of ["front", "back"] as const) {
    const blob = side === "front" ? item.frontBlob : item.backBlob;
    const path = side === "front" ? item.frontPath : item.backPath;
    const done = side === "front" ? item.frontUploaded : item.backUploaded;
    if (!blob || !path || done) continue;
    const { error } = await api.upload(path, blob);
    if (error && classifyError(error) !== "duplicate") return fail(error);
    if (side === "front") item.frontUploaded = true;
    else item.backUploaded = true;
  }

  const row: Record<string, unknown> = { id: item.id, user_id: item.userId, ...item.row };
  if (item.frontPath !== undefined) row.image_path = item.frontPath;
  else if (item.isNew) row.image_path = null;
  if (item.backPath !== undefined) row.back_image_path = item.backPath;

  let res = await api.upsert(row);
  if (isMissingColumn(res.error as { code?: string; message?: string } | null)) {
    // The database has no back photo column yet: a card without a back photo still saves
    if (item.backPath) return { kind: "failed", message: BACK_MIGRATION_MESSAGE };
    delete row.back_image_path;
    res = await api.upsert(row);
  }
  if (res.error) return fail(res.error);

  await api.remove(item.oldPaths.filter((p) => p !== item.frontPath && p !== item.backPath));
  return { kind: "synced" };
}

export async function pushLoyaltyDelete(api: LoyaltyApi, item: LoyaltyDeleteItem): Promise<PushOutcome> {
  const { error } = await api.deleteRow(item.id); // a card that is already gone counts as deleted
  if (error) return fail(error);
  await api.remove(item.paths);
  return { kind: "synced" };
}

// ---------------------------------------------------------------------------------------------------------------
// Building items

/** The card as the person sees it once the waiting change is applied. */
export function cardFromItem(item: LoyaltySaveItem, base?: LoyaltyCard): LoyaltyCard {
  return {
    id: item.id,
    user_id: item.userId,
    ...item.row,
    image_path: item.frontPath !== undefined ? item.frontPath : base?.image_path ?? null,
    back_image_path: item.backPath !== undefined ? item.backPath : base?.back_image_path ?? null,
    created_at: base?.created_at ?? new Date(item.createdAt).toISOString(),
  };
}

/** The cards on screen: the saved list with waiting saves applied and waiting deletes hidden. */
export function applyLoyaltyOutbox(cards: LoyaltyCard[], items: OutboxItem[]): LoyaltyCard[] {
  let out = cards;
  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (isLoyaltySave(item)) {
      const base = out.find((c) => c.id === item.id);
      const card = cardFromItem(item, base);
      out = base ? out.map((c) => (c.id === item.id ? card : c)) : [...out, card];
    } else if (isLoyaltyDelete(item)) {
      out = out.filter((c) => c.id !== item.id);
    }
  }
  return out;
}

const extOf = (b: Blob) => (b.type === "image/webp" ? "webp" : "jpg");

/** Joins a new save onto the one already waiting for the same card, so nothing from the earlier one is lost. */
export function mergeSave(prev: LoyaltySaveItem | undefined, next: LoyaltySaveItem): LoyaltySaveItem {
  if (!prev) return next;
  const merged: LoyaltySaveItem = { ...next, isNew: prev.isNew, createdAt: prev.createdAt, oldPaths: [...prev.oldPaths, ...next.oldPaths] };
  for (const side of ["front", "back"] as const) {
    const path = `${side}Path` as const, blob = `${side}Blob` as const, up = `${side}Uploaded` as const;
    if (next[path] === undefined) {
      // untouched this time: keep what the earlier save wanted
      merged[path] = prev[path];
      merged[blob] = prev[blob];
      merged[up] = prev[up];
    } else if (prev[path] && prev[up]) {
      merged.oldPaths.push(prev[path] as string); // an earlier waiting photo was already uploaded and is now replaced
    }
  }
  merged.oldPaths = [...new Set(merged.oldPaths)].filter((p) => p !== merged.frontPath && p !== merged.backPath);
  return merged;
}

export interface SaveCardArgs {
  api: LoyaltyApi;
  store: OutboxStore;
  userId: string;
  /** The card being edited, or null for a new one. */
  card: LoyaltyCard | null;
  input: CardInput;
  front?: Photo;
  back?: Photo;
  /** The item already waiting for this card, if any. */
  waiting?: OutboxItem | null;
  online?: boolean;
  /** Keeps a new photo on the phone under its future path, so it shows before (and without) the upload. */
  keep?: (path: string, blob: Blob) => Promise<void>;
}

export type SaveResult = { card: LoyaltyCard; queued: boolean };

/** Saves a card now if it can be reached, otherwise keeps it on the phone. Throws with a clear message on a real failure. */
export async function saveCard(a: SaveCardArgs): Promise<SaveResult> {
  const id = a.card?.id ?? (a.waiting && isLoyaltySave(a.waiting) ? a.waiting.id : newId());
  const prev = a.waiting && isLoyaltySave(a.waiting) ? a.waiting : undefined;
  const photo = (file: Photo, current: string | null | undefined) =>
    file ? { path: `${a.userId}/${newId()}.${extOf(file)}`, blob: file as Blob, old: current ? [current] : [] }
    : file === null ? { path: null, blob: null, old: current ? [current] : [] }
    : { path: undefined, blob: undefined, old: [] as string[] };
  const f = photo(a.front, a.card?.image_path);
  const b = photo(a.back, a.card?.back_image_path);

  const item: LoyaltySaveItem = {
    id, userId: a.userId, kind: LOYALTY_SAVE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    isNew: !a.card,
    row: rowOf(a.input),
    frontPath: f.path, frontBlob: f.blob, backPath: b.path, backBlob: b.blob,
    oldPaths: [...f.old, ...b.old],
    label: a.input.store_name.trim(),
    summary: a.card ? "Loyalty card · changed" : "Loyalty card · new",
  };
  const toSend = mergeSave(prev, item);
  const card = cardFromItem(toSend, a.card ?? undefined);

  for (const [path, blob] of [[toSend.frontPath, toSend.frontBlob], [toSend.backPath, toSend.backBlob]] as const) {
    if (path && blob) await a.keep?.(path, blob).catch(() => {});
  }
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushLoyaltySave(a.api, toSend) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { card, queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(toSend); // keeps the photos and what was already uploaded
    return { card, queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "This card already exists." : outcome.message);
}

export interface DeleteCardArgs {
  api: LoyaltyApi;
  store: OutboxStore;
  userId: string;
  card: LoyaltyCard;
  waiting?: OutboxItem | null;
  online?: boolean;
}

/** Deletes a card now if it can be reached, otherwise keeps the wish on the phone. A card that never reached the server is just dropped. */
export async function deleteCard(a: DeleteCardArgs): Promise<{ queued: boolean }> {
  const prev = a.waiting && isLoyaltySave(a.waiting) ? a.waiting : undefined;
  const paths = [a.card.image_path, a.card.back_image_path, ...(prev ? [prev.frontPath, prev.backPath, ...prev.oldPaths] : [])].filter((p): p is string => !!p);
  if (prev?.isNew) {
    await a.store.remove(prev.id);
    await a.api.remove([...new Set(paths)]);
    return { queued: false };
  }
  const item: LoyaltyDeleteItem = {
    id: a.card.id, userId: a.userId, kind: LOYALTY_DELETE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    paths: [...new Set(paths)], label: a.card.store_name, summary: "Loyalty card · delete",
  };
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushLoyaltyDelete(a.api, item) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(item); // replaces any waiting save for the same card
    return { queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "Could not delete the card." : outcome.message);
}
