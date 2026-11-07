import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyError } from "@/lib/offline-queue";
import { newId, type OutboxItem, type OutboxStore, type PushOutcome } from "@/lib/outbox";

/**
 * One way to save and delete a row of any simple table (a trip, a project, a personal expense, a grocery receipt with
 * its items), online or off. Same rules as every other kind: the id is made on the phone and is the database id, so a
 * repeat is harmless; one waiting item per row, the latest wish wins; a file (receipt) is uploaded first and
 * remembered; rows that depend on a waiting row (an expense on a new trip) wait for it.
 */

export const ROW_SAVE = "row.save";
export const ROW_DELETE = "row.delete";

export interface RowChildren {
  table: string;
  /** Column that points at the parent row. */
  fk: string;
  /** All the child rows the parent should have; they replace the ones there now. Each needs its own id. */
  rows: Record<string, unknown>[];
}

export interface RowSaveItem extends OutboxItem {
  kind: typeof ROW_SAVE;
  table: string;
  /** Not in the database yet: `row` is the whole row. Otherwise `row` holds only what changed. */
  isNew: boolean;
  row: Record<string, unknown>;
  /** Column that holds the file's path, and the bucket the file goes to. */
  fileColumn?: string;
  bucket?: string;
  /** The file's path: a path, null (no file) or undefined (leave as it is). */
  path?: string | null;
  blob?: Blob | null;
  uploaded?: boolean;
  oldPaths: string[];
  children?: RowChildren;
}

export interface RowSweep {
  table: string;
  fk: string;
  column: string;
  bucket: string;
}

export interface RowDeleteItem extends OutboxItem {
  kind: typeof ROW_DELETE;
  table: string;
  bucket?: string;
  paths: string[];
  /** Files that belong to rows of other tables which go with this one; looked up when the delete is sent. */
  sweep?: RowSweep[];
}

export const isRowSave = (i: OutboxItem): i is RowSaveItem => i.kind === ROW_SAVE;
export const isRowDelete = (i: OutboxItem): i is RowDeleteItem => i.kind === ROW_DELETE;

export interface RowApi {
  upload(bucket: string, path: string, blob: Blob): Promise<{ error: unknown | null }>;
  upsert(table: string, row: Record<string, unknown>): Promise<{ error: unknown | null }>;
  update(table: string, id: string, patch: Record<string, unknown>): Promise<{ error: unknown | null }>;
  deleteRow(table: string, id: string): Promise<{ error: unknown | null }>;
  deleteWhere(table: string, column: string, value: string): Promise<{ error: unknown | null }>;
  insertMany(table: string, rows: Record<string, unknown>[]): Promise<{ error: unknown | null }>;
  selectColumn(table: string, fk: string, id: string, column: string): Promise<{ values: string[]; error: unknown | null }>;
  remove(bucket: string, paths: string[]): Promise<void>;
}

export function makeRowApi(supabase: SupabaseClient): RowApi {
  return {
    async upload(bucket, path, blob) {
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
      return { error };
    },
    async upsert(table, row) {
      const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
      return { error };
    },
    async update(table, id, patch) {
      const { error } = await supabase.from(table).update(patch).eq("id", id);
      return { error };
    },
    async deleteRow(table, id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      return { error };
    },
    async deleteWhere(table, column, value) {
      const { error } = await supabase.from(table).delete().eq(column, value);
      return { error };
    },
    async insertMany(table, rows) {
      if (!rows.length) return { error: null };
      const { error } = await supabase.from(table).insert(rows);
      return { error };
    },
    async selectColumn(table, fk, id, column) {
      const { data, error } = await supabase.from(table).select(column).eq(fk, id);
      const values = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => r[column]).filter((v): v is string => typeof v === "string" && !!v);
      return { values, error };
    },
    async remove(bucket, paths) {
      if (paths.length) await supabase.storage.from(bucket).remove(paths).catch(() => {});
    },
  };
}

const fail = (error: unknown): PushOutcome => {
  const k = classifyError(error);
  const message = (error as { message?: string } | null)?.message || "Could not save.";
  if (k === "network" || k === "auth") return { kind: "offline" };
  if (k === "conflict") return { kind: "conflict", message: /foreign key/i.test(message) ? "The item this belongs to no longer exists." : "You no longer have permission to change this." };
  return { kind: "failed", message: /relation|schema cache/i.test(message) ? "A table is missing. Run the latest migration in Supabase." : message };
};

/** Sends one waiting row. Safe to repeat. */
export async function pushRowSave(api: RowApi, item: RowSaveItem): Promise<PushOutcome> {
  if (item.blob && item.path && item.bucket && !item.uploaded) {
    const { error } = await api.upload(item.bucket, item.path, item.blob);
    if (error && classifyError(error) !== "duplicate") return fail(error);
    item.uploaded = true;
  }
  const row: Record<string, unknown> = { ...item.row };
  if (item.fileColumn && item.path !== undefined) row[item.fileColumn] = item.path;
  else if (item.fileColumn && item.isNew && !(item.fileColumn in row)) row[item.fileColumn] = null;

  const res = item.isNew ? await api.upsert(item.table, { ...row, id: item.id, user_id: item.userId }) : await api.update(item.table, item.id, row);
  if (res.error) return fail(res.error);

  if (item.children) {
    const c = item.children;
    const gone = await api.deleteWhere(c.table, c.fk, item.id);
    if (gone.error) return fail(gone.error);
    const added = await api.insertMany(c.table, c.rows.map((r) => ({ ...r, [c.fk]: item.id })));
    if (added.error) return fail(added.error);
  }
  if (item.bucket) await api.remove(item.bucket, item.oldPaths.filter((p) => p !== item.path));
  return { kind: "synced" };
}

export async function pushRowDelete(api: RowApi, item: RowDeleteItem): Promise<PushOutcome> {
  const swept: { bucket: string; paths: string[] }[] = [];
  for (const s of item.sweep ?? []) {
    const r = await api.selectColumn(s.table, s.fk, item.id, s.column);
    if (r.error) return fail(r.error);
    swept.push({ bucket: s.bucket, paths: r.values });
  }
  const { error } = await api.deleteRow(item.table, item.id); // already gone counts as deleted
  if (error) return fail(error);
  if (item.bucket) await api.remove(item.bucket, item.paths);
  for (const s of swept) await api.remove(s.bucket, s.paths);
  return { kind: "synced" };
}

// ---------------------------------------------------------------------------------------------------------------

/** The rows on screen for one table: waiting saves applied, waiting deletes hidden. A new row is added only when `include` says it belongs to this list. */
export function applyRows<T extends { id: string }>(rows: T[], items: OutboxItem[], table: string, include: (row: Record<string, unknown>) => boolean = () => true): T[] {
  let out = rows;
  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (isRowSave(item) && item.table === table) {
      const patch = { ...item.row, ...(item.fileColumn && item.path !== undefined ? { [item.fileColumn]: item.path } : {}) };
      if (out.some((r) => r.id === item.id)) out = out.map((r) => (r.id === item.id ? { ...r, ...patch } : r));
      else if (item.isNew && include(patch)) out = [...out, { created_at: new Date(item.createdAt).toISOString(), ...patch, id: item.id } as unknown as T];
    } else if (isRowDelete(item) && item.table === table) {
      out = out.filter((r) => r.id !== item.id);
    }
  }
  return out;
}

/** Ids of rows with something waiting, for the "waiting to sync" marker. */
export const waitingRowIds = (items: OutboxItem[], table: string): Set<string> =>
  new Set(items.filter((i) => (isRowSave(i) || isRowDelete(i)) && i.table === table).map((i) => i.id));

export function mergeRowSave(prev: RowSaveItem | undefined, next: RowSaveItem): RowSaveItem {
  if (!prev) return next;
  const merged: RowSaveItem = {
    ...next, isNew: prev.isNew, createdAt: prev.createdAt, row: { ...prev.row, ...next.row },
    oldPaths: [...prev.oldPaths, ...next.oldPaths], dependsOn: next.dependsOn ?? prev.dependsOn,
    children: next.children ?? prev.children,
  };
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

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

export interface SaveRowArgs {
  api: RowApi;
  store: OutboxStore;
  userId: string;
  table: string;
  /** The row's id: an existing one, or undefined for a new row (a fresh id is made). */
  id?: string;
  /** The whole row for a new one, only what changed for an existing one. */
  row: Record<string, unknown>;
  /** A new file to attach, with where it goes. `folder` is the part of the path after the owner, for example the trip id. */
  file?: File | null;
  fileColumn?: string;
  bucket?: string;
  folder?: string;
  currentPath?: string | null;
  children?: RowChildren;
  dependsOn?: string[];
  waiting?: OutboxItem | null;
  online?: boolean;
  keep?: (path: string, blob: Blob) => Promise<void>;
  label: string;
  summary: string;
}

export async function saveRow(a: SaveRowArgs): Promise<{ id: string; queued: boolean; path: string | null | undefined }> {
  const prev = a.waiting && isRowSave(a.waiting) ? a.waiting : undefined;
  const id = a.id ?? prev?.id ?? newId();
  let path: string | undefined;
  if (a.file && a.bucket) path = `${[a.userId, a.folder].filter(Boolean).join("/")}/${newId()}.${EXT[a.file.type] || "jpg"}`;
  const item: RowSaveItem = {
    id, userId: a.userId, kind: ROW_SAVE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    table: a.table, isNew: !a.id, row: a.row, fileColumn: a.fileColumn, bucket: a.bucket, path, blob: a.file ?? undefined,
    oldPaths: a.file && a.currentPath ? [a.currentPath] : [], children: a.children,
    dependsOn: a.dependsOn?.length ? a.dependsOn : undefined, label: a.label, summary: a.summary,
  };
  const toSend = mergeRowSave(prev, item);
  if (toSend.path && toSend.blob && toSend.bucket) await a.keep?.(toSend.path, toSend.blob).catch(() => {});
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  // A row that waits for another one cannot be sent yet
  const blocked = !!toSend.dependsOn?.length && (await a.store.list()).some((i) => toSend.dependsOn!.includes(i.id));
  const outcome: PushOutcome = online && !blocked ? await pushRowSave(a.api, toSend) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { id, queued: false, path: toSend.path };
  }
  if (outcome.kind === "offline") {
    await a.store.put(toSend);
    return { id, queued: true, path: toSend.path };
  }
  throw new Error(outcome.kind === "duplicate" ? "This was already saved." : outcome.message);
}

export interface DeleteRowArgs {
  api: RowApi;
  store: OutboxStore;
  userId: string;
  table: string;
  id: string;
  bucket?: string;
  /** Files of this row. */
  paths?: (string | null | undefined)[];
  sweep?: RowSweep[];
  waiting?: OutboxItem | null;
  online?: boolean;
  label: string;
  summary: string;
}

export async function deleteRow(a: DeleteRowArgs): Promise<{ queued: boolean }> {
  const prev = a.waiting && isRowSave(a.waiting) ? a.waiting : undefined;
  const paths = [...new Set([...(a.paths ?? []), ...(prev ? [prev.path, ...prev.oldPaths] : [])].filter((p): p is string => !!p))];
  if (prev?.isNew) {
    // It never reached the server: forget it, and anything that was waiting on it
    await a.store.remove(prev.id);
    for (const i of await a.store.list()) if (i.dependsOn?.includes(a.id)) await a.store.remove(i.id);
    if (a.bucket) await a.api.remove(a.bucket, paths);
    return { queued: false };
  }
  const item: RowDeleteItem = {
    id: a.id, userId: a.userId, kind: ROW_DELETE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    table: a.table, bucket: a.bucket, paths, sweep: a.sweep, label: a.label, summary: a.summary,
  };
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushRowDelete(a.api, item) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(item); // replaces a waiting save of the same row
    return { queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "Could not delete." : outcome.message);
}

/** The ids a new row must wait for: the parent, if the parent is itself still waiting. */
export async function waitingParents(store: OutboxStore, parentIds: (string | null | undefined)[]): Promise<string[]> {
  const live = new Set((await store.list()).map((i) => i.id));
  return parentIds.filter((p): p is string => !!p && live.has(p));
}
