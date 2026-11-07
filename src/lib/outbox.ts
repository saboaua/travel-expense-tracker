/**
 * The offline outbox: every change made with no connection (a receipt, a trip, a card, ...) waits here on the phone
 * and is sent when the connection is back. One engine for every kind of change; each kind brings its own "send" step.
 *
 * Rules that keep it safe, whatever the kind:
 *  - An item gets its id on the phone and uses it as the database id, so sending twice (a retry, two tabs, a lost
 *    reply) can never create a duplicate: "already exists" means done.
 *  - Items belong to the person who made them. They are only sent while that same person is signed in.
 *  - An item can wait for another one (`dependsOn`): a trip is sent before its expenses.
 *  - A failure that retrying cannot fix is shown to the person instead of being retried forever.
 *  - An item of a kind this version does not know is left alone, never dropped.
 */

export type QueueStatus = "pending" | "conflict" | "failed" | "duplicate";

export interface OutboxItem {
  id: string;
  userId: string;
  /** What it is, for example "expense.create". Picks the handler that sends it. */
  kind: string;
  createdAt: number;
  status: QueueStatus;
  error: string | null;
  attempts: number;
  /** Ids of items that must be sent first. */
  dependsOn?: string[];
  /** Shown on the Waiting page for kinds that have no card of their own. */
  label?: string;
  summary?: string;
}

export type PushOutcome<M = unknown> =
  | { kind: "synced" }
  | { kind: "offline" }
  | { kind: "duplicate"; matches: M[] }
  | { kind: "conflict"; message: string }
  | { kind: "failed"; message: string };

export interface OutboxStore<T extends OutboxItem = OutboxItem> {
  list(): Promise<T[]>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Sends one item. Must be safe to repeat. May update the item (for example to remember a finished upload). */
export type Handler<T extends OutboxItem = OutboxItem> = (item: T) => Promise<PushOutcome>;
export type Handlers<T extends OutboxItem = OutboxItem> = Record<string, Handler<T>>;

export interface SyncResult {
  synced: number;
  /** Kinds of the items that were sent, so the screen can say "2 receipts synced". */
  syncedKinds: string[];
  /** Items of this user still waiting (offline, or needing attention). */
  remaining: number;
  offline: boolean;
}

export const MAX_AUTO_ATTEMPTS = 5;

/** Sends everything waiting for `userId`, oldest first. Stops at the first sign of no connection. */
export async function runOutbox<T extends OutboxItem>(
  store: OutboxStore<T>,
  handlers: Handlers<T>,
  currentUser: () => Promise<{ userId: string | null; offline: boolean }>,
  userId: string
): Promise<SyncResult> {
  const mine = (await store.list()).filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  const waiting = mine.filter((i) => i.status === "pending" && i.attempts < MAX_AUTO_ATTEMPTS && handlers[i.kind]);
  if (waiting.length === 0) return { synced: 0, syncedKinds: [], remaining: mine.length, offline: false };

  // Never send someone else's items, and never send anything if we cannot tell who is signed in.
  const who = await currentUser();
  if (who.offline) return { synced: 0, syncedKinds: [], remaining: mine.length, offline: true };
  if (who.userId !== userId) return { synced: 0, syncedKinds: [], remaining: mine.length, offline: false };

  const live = new Set(mine.map((i) => i.id));
  const syncedKinds: string[] = [];
  let offline = false;
  let queue = waiting;
  // More than one pass, because an item that had to wait for another can go as soon as that one is sent
  while (queue.length > 0 && !offline) {
    const blocked: T[] = [];
    let progressed = false;
    for (const item of queue) {
      // Wait for the items this one depends on (they are removed from `live` as they are sent)
      if (item.dependsOn?.some((d) => live.has(d))) {
        blocked.push(item);
        continue;
      }
      progressed = true;
      const outcome = await handlers[item.kind](item);
      if (outcome.kind === "synced") {
        await store.remove(item.id);
        live.delete(item.id);
        syncedKinds.push(item.kind);
      } else if (outcome.kind === "offline") {
        await store.put(item); // keeps whatever the handler remembered, such as a finished upload
        offline = true;
        break;
      } else if (outcome.kind === "duplicate") {
        item.status = "duplicate";
        (item as OutboxItem & { duplicates?: unknown[] }).duplicates = outcome.matches;
        item.error = "Looks like a receipt you already saved.";
        await store.put(item);
      } else {
        item.attempts += 1;
        item.error = outcome.message;
        item.status = outcome.kind === "conflict" ? "conflict" : item.attempts >= MAX_AUTO_ATTEMPTS ? "failed" : "pending";
        await store.put(item);
      }
    }
    if (!progressed) break;
    queue = blocked;
  }
  const after = (await store.list()).filter((i) => i.userId === userId).length;
  return { synced: syncedKinds.length, syncedKinds, remaining: after, offline };
}

// ---------------------------------------------------------------------------------------------------------------
// Words for the screen

const NOUNS: Record<string, [string, string]> = {
  "expense.create": ["receipt", "receipts"],
  "loyalty.save": ["card", "cards"],
  "loyalty.delete": ["card", "cards"],
  "expense.update": ["expense change", "expense changes"],
  "expense.delete": ["expense change", "expense changes"],
  "document.save": ["document", "documents"],
  "document.delete": ["document", "documents"],
};

/** "receipt" / "receipts" when every item is that kind, otherwise "change" / "changes". */
export function nounFor(kinds: string[], count: number = kinds.length): string {
  const set = new Set(kinds);
  const [one, many] = set.size === 1 ? NOUNS[[...set][0]] ?? ["change", "changes"] : ["change", "changes"];
  return count === 1 ? one : many;
}

// ---------------------------------------------------------------------------------------------------------------
// Browser storage (IndexedDB). Not used by the tests, which pass their own store.

const DB_NAME = "expense-tracker-offline";
// The store is still called "expenses" because that is what it was first made for; it now holds every kind.
const STORE = "expenses";
export const QUEUE_EVENT = "expense-queue-changed";
/** Fired after waiting changes were sent, so a screen can load its list again. */
export const SYNCED_EVENT = "outbox-synced";

/** Items saved before kinds existed were all expenses. */
export function withKind<T extends OutboxItem>(raw: T | (Omit<T, "kind"> & { kind?: string })): T {
  return (raw as T).kind ? (raw as T) : ({ ...raw, kind: "expense.create" } as T);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

export const browserOutbox: OutboxStore<OutboxItem> = {
  async list() {
    const all = await tx("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    return all.map((i) => withKind(i));
  },
  async put(item) {
    await tx("readwrite", (s) => s.put(item));
    notifyQueueChanged();
  },
  async remove(id) {
    await tx("readwrite", (s) => s.delete(id));
    notifyQueueChanged();
  },
};

/** Keeps a change on the device. Resolves false if the browser would not store it (private mode, storage full). */
export async function enqueue(item: OutboxItem): Promise<boolean> {
  try {
    await browserOutbox.put(item);
    return true;
  } catch {
    return false;
  }
}

/** Runs one sync at a time across tabs (Web Locks), or just here when the browser has no locks. */
export async function syncOutbox(handlers: Handlers, currentUser: () => Promise<{ userId: string | null; offline: boolean }>, userId: string): Promise<SyncResult | null> {
  const run = () => runOutbox(browserOutbox, handlers, currentUser, userId);
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return run();
  return locks.request("expense-queue-sync", { ifAvailable: true }, async (lock) => (lock ? run() : null));
}

/** A fresh id made on the phone. It becomes the database id, which is what makes a repeat harmless. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Very old browsers: v4-shaped id from Math.random (only needs to be unique, not secret).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
