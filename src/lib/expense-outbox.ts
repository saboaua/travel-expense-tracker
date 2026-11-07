import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyError } from "@/lib/offline-queue";
import { newId, type OutboxItem, type OutboxStore, type PushOutcome } from "@/lib/outbox";

/**
 * Changing and deleting an expense that is already saved, online or off. Same rules as cards and documents: tried
 * right away, kept on the phone when there is no connection, one waiting item per expense (the item id is the expense
 * id, so the latest wish wins and a repeat is harmless).
 */

export const EXPENSE_UPDATE = "expense.update";
export const EXPENSE_DELETE = "expense.delete";
export const RECEIPT_BUCKET = "receipts";

export interface ExpenseFields {
  merchant: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_usd: number | null;
  category: string;
  expense_date: string;
  notes: string | null;
}

export interface ExpenseUpdateItem extends OutboxItem {
  kind: typeof EXPENSE_UPDATE;
  tripId: string;
  fields: ExpenseFields;
  /** Receipt path: a path, null (no receipt) or undefined (leave as it is). */
  path?: string | null;
  blob?: Blob | null;
  uploaded?: boolean;
  oldPaths: string[];
}

export interface ExpenseDeleteItem extends OutboxItem {
  kind: typeof EXPENSE_DELETE;
  tripId: string;
  paths: string[];
}

export const isExpenseUpdate = (i: OutboxItem): i is ExpenseUpdateItem => i.kind === EXPENSE_UPDATE;
export const isExpenseDelete = (i: OutboxItem): i is ExpenseDeleteItem => i.kind === EXPENSE_DELETE;

export interface ExpenseChangeApi {
  upload(path: string, blob: Blob): Promise<{ error: unknown | null }>;
  update(id: string, patch: Record<string, unknown>): Promise<{ error: unknown | null }>;
  deleteRow(id: string): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<void>;
}

export function makeExpenseChangeApi(supabase: SupabaseClient): ExpenseChangeApi {
  return {
    async upload(path, blob) {
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      return { error };
    },
    async update(id, patch) {
      const { error } = await supabase.from("expenses").update(patch).eq("id", id);
      return { error };
    },
    async deleteRow(id) {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      return { error };
    },
    async remove(paths) {
      if (paths.length) await supabase.storage.from(RECEIPT_BUCKET).remove(paths).catch(() => {});
    },
  };
}

const fail = (error: unknown): PushOutcome => {
  const k = classifyError(error);
  const message = (error as { message?: string } | null)?.message || "Could not save the expense.";
  if (k === "network" || k === "auth") return { kind: "offline" };
  return k === "conflict" ? { kind: "conflict", message: "You no longer have permission to change this expense." } : { kind: "failed", message };
};

export async function pushExpenseUpdate(api: ExpenseChangeApi, item: ExpenseUpdateItem): Promise<PushOutcome> {
  if (item.blob && item.path && !item.uploaded) {
    const { error } = await api.upload(item.path, item.blob);
    if (error && classifyError(error) !== "duplicate") return fail(error);
    item.uploaded = true;
  }
  const patch: Record<string, unknown> = { ...item.fields, updated_at: new Date(item.createdAt).toISOString() };
  if (item.path !== undefined) patch.receipt_path = item.path;
  const { error } = await api.update(item.id, patch); // an expense that is already gone updates nothing, which is fine
  if (error) return fail(error);
  await api.remove(item.oldPaths.filter((p) => p !== item.path));
  return { kind: "synced" };
}

export async function pushExpenseDelete(api: ExpenseChangeApi, item: ExpenseDeleteItem): Promise<PushOutcome> {
  const { error } = await api.deleteRow(item.id);
  if (error) return fail(error);
  await api.remove(item.paths);
  return { kind: "synced" };
}

// ---------------------------------------------------------------------------------------------------------------

interface ShownExpense {
  id: string;
  merchant: string | null;
  amount: number;
  currency?: string | null;
  exchange_rate?: number | null;
  amount_usd?: number | null;
  category: string | null;
  expense_date: string;
  notes: string | null;
  receipt_path: string | null;
}

/** The expenses on screen: waiting changes applied, waiting deletes hidden. */
export function applyExpenseOutbox<T extends ShownExpense>(expenses: T[], items: OutboxItem[]): T[] {
  let out = expenses;
  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (isExpenseUpdate(item)) {
      out = out.map((e) => (e.id === item.id ? { ...e, ...item.fields, receipt_path: item.path !== undefined ? item.path : e.receipt_path } : e));
    } else if (isExpenseDelete(item)) {
      out = out.filter((e) => e.id !== item.id);
    }
  }
  return out;
}

export function mergeExpenseUpdate(prev: ExpenseUpdateItem | undefined, next: ExpenseUpdateItem): ExpenseUpdateItem {
  if (!prev) return next;
  const merged: ExpenseUpdateItem = { ...next, createdAt: prev.createdAt, oldPaths: [...prev.oldPaths, ...next.oldPaths] };
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

export interface SaveExpenseChangeArgs {
  api: ExpenseChangeApi;
  store: OutboxStore;
  userId: string;
  expenseId: string;
  tripId: string;
  fields: ExpenseFields;
  /** The receipt now on the expense, if a new file was chosen. */
  file?: File | null;
  /** The receipt the expense has now, replaced when a new file is chosen. */
  currentPath?: string | null;
  waiting?: OutboxItem | null;
  online?: boolean;
  keep?: (path: string, blob: Blob) => Promise<void>;
}

export async function saveExpenseChange(a: SaveExpenseChangeArgs): Promise<{ queued: boolean; path: string | null | undefined }> {
  const prev = a.waiting && isExpenseUpdate(a.waiting) ? a.waiting : undefined;
  let path: string | undefined;
  if (a.file) path = `${a.userId}/${a.tripId}/${newId()}.${EXT[a.file.type] || "jpg"}`;
  const item: ExpenseUpdateItem = {
    id: a.expenseId, userId: a.userId, kind: EXPENSE_UPDATE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    tripId: a.tripId, fields: a.fields, path, blob: a.file ?? undefined, oldPaths: a.file && a.currentPath ? [a.currentPath] : [],
    label: a.fields.merchant || "Expense", summary: "Expense · changed",
  };
  const toSend = mergeExpenseUpdate(prev, item);
  if (toSend.path && toSend.blob) await a.keep?.(toSend.path, toSend.blob).catch(() => {});
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushExpenseUpdate(a.api, toSend) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { queued: false, path: toSend.path };
  }
  if (outcome.kind === "offline") {
    await a.store.put(toSend);
    return { queued: true, path: toSend.path };
  }
  throw new Error(outcome.kind === "duplicate" ? "This expense was already changed." : outcome.message);
}

export interface DeleteExpenseArgs {
  api: ExpenseChangeApi;
  store: OutboxStore;
  userId: string;
  expense: { id: string; merchant: string | null; receipt_path: string | null };
  tripId: string;
  waiting?: OutboxItem | null;
  online?: boolean;
}

export async function deleteExpenseChange(a: DeleteExpenseArgs): Promise<{ queued: boolean }> {
  const prev = a.waiting && isExpenseUpdate(a.waiting) ? a.waiting : undefined;
  const paths = [...new Set([a.expense.receipt_path, ...(prev ? [prev.path, ...prev.oldPaths] : [])].filter((p): p is string => !!p))];
  const item: ExpenseDeleteItem = {
    id: a.expense.id, userId: a.userId, kind: EXPENSE_DELETE, createdAt: Date.now(), status: "pending", error: null, attempts: 0,
    tripId: a.tripId, paths, label: a.expense.merchant || "Expense", summary: "Expense · delete",
  };
  const online = a.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  const outcome: PushOutcome = online ? await pushExpenseDelete(a.api, item) : { kind: "offline" };
  if (outcome.kind === "synced") {
    if (prev) await a.store.remove(prev.id);
    return { queued: false };
  }
  if (outcome.kind === "offline") {
    await a.store.put(item); // replaces a waiting change to the same expense
    return { queued: true };
  }
  throw new Error(outcome.kind === "duplicate" ? "Could not delete the expense." : outcome.message);
}
