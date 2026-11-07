import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/columns";
import type { DocKind, TravelDocument } from "@/lib/documents";
import { DOC_BUCKET, dbMessage, prepareDocFile, safeName } from "@/lib/document-upload";
import { classifyError } from "@/lib/offline-queue";
import { newId, type OutboxItem, type OutboxStore, type PushOutcome } from "@/lib/outbox";

/**
 * Adding, editing and deleting documents, online or off. Same shape as loyalty cards: the document id and the file
 * path are made on the phone, so a repeat is harmless, and each document has one waiting item (the latest wish wins).
 */

export const DOCUMENT_SAVE = "document.save";
export const DOCUMENT_DELETE = "document.delete";

export interface DocumentFields {
  kind: DocKind;
  title: string;
  document_number?: string | null;
  issuing_country?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}

export interface DocumentSaveItem extends OutboxItem {
  kind: typeof DOCUMENT_SAVE;
  isNew: boolean;
  tripId: string | null;
  /** Everything but the file; document_number is left out when the database may not have the column. */
  row: Record<string, unknown>;
  /** The file's path: a path, null (no file) or undefined (leave as it is). */
  path?: string | null;
  blob?: Blob | null;
  uploaded?: boolean;
  oldPaths: string[];
}

export interface DocumentDeleteItem extends OutboxItem {
  kind: typeof DOCUMENT_DELETE;
  paths: string[];
}

export const isDocumentSave = (i: OutboxItem): i is DocumentSaveItem => i.kind === DOCUMENT_SAVE;
export const isDocumentDelete = (i: OutboxItem): i is DocumentDeleteItem => i.kind === DOCUMENT_DELETE;

export interface DocumentApi {
  upload(path: string, blob: Blob): Promise<{ error: unknown | null }>;
  upsert(row: Record<string, unknown>): Promise<{ error: unknown | null }>;
  deleteRow(id: string): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<void>;
}

export function makeDocumentApi(supabase: SupabaseClient): DocumentApi {
  return {
    async upload(path, blob) {
      const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      return { error };
    },
    async upsert(row) {
      const { error } = await supabase.from("travel_documents").upsert(row, { onConflict: "id" });
      return { error };
    },
    async deleteRow(id) {
      const { error } = await supabase.from("travel_documents").delete().eq("id", id);
      return { error };
    },
    async remove(paths) {
      if (paths.length) await supabase.storage.from(DOC_BUCKET).remove(paths).catch(() => {});
    },
  };
}

const BUCKET_MESSAGE = "Documents storage is not set up yet. Run supabase/migration_documents.sql.";
const NUMBER_MESSAGE = "The document number column is missing. Run supabase/migration_documents_number.sql in Supabase.";

const fail = (error: unknown): PushOutcome => {
  const k = classifyError(error);
  const message = (error as { message?: string } | null)?.message || "Could not save the document.";
  if (k === "network" || k === "auth") return { kind: "offline" };
  return k === "conflict" ? { kind: "conflict", message: "You no longer have permission to change this document." } : { kind: "failed", message: dbMessage(message) };
};

/** Sends one waiting document. Safe to repeat. */
export async function pushDocumentSave(api: DocumentApi, item: DocumentSaveItem): Promise<PushOutcome> {
  if (item.blob && item.path && !item.uploaded) {
    const { error } = await api.upload(item.path, item.blob);
    if (error && classifyError(error) !== "duplicate") {
      if (/bucket/i.test((error as { message?: string }).message ?? "")) return { kind: "failed", message: BUCKET_MESSAGE };
      return fail(error);
    }
    item.uploaded = true;
  }

  const row: Record<string, unknown> = { id: item.id, user_id: item.userId, trip_id: item.tripId, ...item.row };
  if (item.path !== undefined) row.file_path = item.path;
  else if (item.isNew) row.file_path = null;

  let res = await api.upsert(row);
  if (isMissingColumn(res.error as { code?: string; message?: string } | null) && "document_number" in row) {
    // An older database without the number column: a document with no number still saves
    if (row.document_number) return { kind: "failed", message: NUMBER_MESSAGE };
    delete row.document_number;
    res = await api.upsert(row);
  }
  if (res.error) return fail(res.error);

  await api.remove(item.oldPaths.filter((p) => p !== item.path));
  return { kind: "synced" };
}

export async function pushDocumentDelete(api: DocumentApi, item: DocumentDeleteItem): Promise<PushOutcome> {
  const { error } = await api.deleteRow(item.id); // already gone counts as deleted
  if (error) return fail(error);
  await api.remove(item.paths);
  return { kind: "synced" };
}

// ---------------------------------------------------------------------------------------------------------------

export function documentFromItem(item: DocumentSaveItem, base?: TravelDocument): TravelDocument {
  return {
    ...(base ?? { issuing_country: null, expiry_date: null, notes: null, created_at: new Date(item.createdAt).toISOString() }),
    id: item.id,
    user_id: item.userId,
    trip_id: item.tripId,
    ...(item.row as Partial<TravelDocument>),
    file_path: item.path !== undefined ? item.path : base?.file_path ?? null,
  } as TravelDocument;
}

/** The documents on screen: the saved list with waiting saves applied and waiting deletes hidden. `tripId` is the list being shown. */
export function applyDocumentOutbox(docs: TravelDocument[], items: OutboxItem[], tripId: string | null = null): TravelDocument[] {
  let out = docs;
  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (isDocumentSave(item)) {
      const base = out.find((d) => d.id === item.id);
      if (base) out = out.map((d) => (d.id === item.id ? documentFromItem(item, base) : d));
      else if (item.tripId === tripId) out = [...out, documentFromItem(item)];
    } else if (isDocumentDelete(item)) {
      out = out.filter((d) => d.id !== item.id);
    }
  }
  return out;
}

export function mergeDocumentSave(prev: DocumentSaveItem | undefined, next: DocumentSaveItem): DocumentSaveItem {
  if (!prev) return next;
  const merged: DocumentSaveItem = { ...next, isNew: prev.isNew, createdAt: prev.createdAt, oldPaths: [...prev.oldPaths, ...next.oldPaths] };
  if (next.path === undefined) {
    merged.path = prev.path;
    merged.blob = prev.blob;
    merged.uploaded = prev.uploaded;
  } else if (prev.path && prev.uploaded) {
    merged.oldPaths.push(prev.path);
  }
  merged.oldPaths = [...new Set(merged.oldPaths)].filter((p) => p !== merged.path);
  return merged;
}

export interface SaveDocumentArgs {
  api: DocumentApi;
  store: OutboxStore;
  userId: string;
  /** The document being edited, or null for a new one. */
  doc: TravelDocument | null;
  tripId?: string | null;
  fields: DocumentFields;
  /** A new file to attach (already prepared by the form unless `prepared` is false). */
  file?: File | null;
  prepared?: boolean;
  waiting?: OutboxItem | null;
  online?: boolean;
  keep?: (path: string, blob: Blob) => Promise<void>;
}

export type SaveDocumentResult = { doc: TravelDocument; queued: boolean };

export async function saveDocument(a: SaveDocumentArgs): Promise<SaveDocumentResult> {
  const prev = a.waiting && isDocumentSave(a.waiting) ? a.waiting : undefined;
  const id = a.doc?.id ?? prev?.id ?? newId();
  const tripId = a.doc ? a.doc.trip_id : a.tripId ?? null;

  let path: string | null | undefined;
  let blob: Blob | null | undefined;
  const old: string[] = [];
  if (a.file) {
    const file = await prepareDocFile(a.file, a.prepared);
    path = `${a.userId}/${tripId || "general"}/${newId()}-${safeName(file.name)}`;
    blob = file;
    if (a.doc?.file_path) old.push(a.doc.file_path);
  }

  const number = a.fields.document_number?.trim() || null;
  const row: Record<string, unknown> = {
    kind: a.fields.kind,
    title: a.fields.title.trim().slice(0, 120),
    issuing_country: a.fields.issuing_country?.trim() || null,
    expiry_date: a.fields.expiry_date || null,
    notes: a.fields.notes?.trim() || null,
    // Only send the number when there is one or the column is known to exist, so older databases keep working
    ...(number || (a.doc && a.doc.document_number !== undefined) || (prev && "document_number" in prev.row) ? { document_number: number ? number.slice(0, 40) : null } : {}),
  };
  const item: DocumentSaveItem = {
    id, userId: a.userId, kind: DOCUMENT_SAVE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    isNew: !a.doc, tripId, row, path, blob, oldPaths: old,
    label: String(row.title),
    summary: a.doc ? "Document · changed" : "Document · new",
  };
  const toSend = mergeDocumentSave(prev, item);
  const doc = documentFromItem(toSend, a.doc ?? undefined);

  if (toSend.path && toSend.blob) await a.keep?.(toSend.path, toSend.blob).catch(() => {});
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushDocumentSave(a.api, toSend) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { doc, queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(toSend);
    return { doc, queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "This document already exists." : outcome.message);
}

export interface DeleteDocumentArgs {
  api: DocumentApi;
  store: OutboxStore;
  userId: string;
  doc: TravelDocument;
  waiting?: OutboxItem | null;
  online?: boolean;
}

export async function deleteDocument(a: DeleteDocumentArgs): Promise<{ queued: boolean }> {
  const prev = a.waiting && isDocumentSave(a.waiting) ? a.waiting : undefined;
  const paths = [...new Set([a.doc.file_path, ...(prev ? [prev.path, ...prev.oldPaths] : [])].filter((p): p is string => !!p))];
  if (prev?.isNew) {
    await a.store.remove(prev.id);
    await a.api.remove(paths);
    return { queued: false };
  }
  const item: DocumentDeleteItem = {
    id: a.doc.id, userId: a.userId, kind: DOCUMENT_DELETE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    paths, label: a.doc.title, summary: "Document · delete",
  };
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushDocumentDelete(a.api, item) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(item);
    return { queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "Could not delete the document." : outcome.message);
}
