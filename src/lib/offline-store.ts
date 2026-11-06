import { classifyError } from "@/lib/offline-queue";

/**
 * A copy of what the person last saw, kept on the phone so the app still shows it with no connection.
 * The server stays the source of truth: every online load replaces the copy, and a cleared phone just reloads.
 * Keys start with the user id, so one person never sees another's copy.
 */

export type Saved<T> = { value: T; savedAt: number };

export interface Kv {
  get<T>(key: string): Promise<Saved<T> | null>;
  set(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

export interface BlobStore {
  get(key: string): Promise<Blob | null>;
  has(key: string): Promise<boolean>;
  put(key: string, blob: Blob): Promise<void>;
  clear(): Promise<void>;
}

/** In memory, for tests. */
export function memoryKv(now: () => number = Date.now): Kv {
  const m = new Map<string, Saved<unknown>>();
  return {
    async get<T>(key: string) { return (m.get(key) as Saved<T> | undefined) ?? null; },
    async set(key, value) { m.set(key, { value: JSON.parse(JSON.stringify(value)), savedAt: now() }); },
    async clear() { m.clear(); },
  };
}

export type Loaded<T> = { ok: true; data: T; fromCache: boolean; savedAt: number } | { ok: false; error: unknown };

const browserOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * Loads fresh data and keeps a copy. When there is no connection (or the request fails on the network) the saved copy
 * is returned instead. Any other error (a missing table, no permission) is passed on, never hidden behind old data.
 */
export async function loadWithCache<T>(
  kv: Kv,
  key: string,
  run: () => PromiseLike<{ data: T | null; error: unknown }>,
  isOnline: () => boolean = browserOnline
): Promise<Loaded<T>> {
  let error: unknown = null;
  if (isOnline()) {
    try {
      const r = await run();
      if (!r.error && r.data !== null && r.data !== undefined) {
        const savedAt = Date.now();
        await kv.set(key, r.data).catch(() => {}); // a full phone must never break a working screen
        return { ok: true, data: r.data, fromCache: false, savedAt };
      }
      error = r.error ?? new Error("Nothing came back.");
    } catch (e) {
      error = e;
    }
    if (classifyError(error) !== "network") return { ok: false, error };
  }
  const saved = await kv.get<T>(key).catch(() => null);
  if (saved) return { ok: true, data: saved.value, fromCache: true, savedAt: saved.savedAt };
  return { ok: false, error: error ?? new Error("You are offline and nothing is saved on this phone yet. Open this page once with a connection.") };
}

// ---------------------------------------------------------------------------------------------------------------
// Browser storage (IndexedDB). Not used by the tests, which pass their own store.

const DB_NAME = "expense-tracker-cache";
const DATA = "data";
const FILES = "files";
export const PAGES_CACHE = "expense-pages-v1";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of [DATA, FILES]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const browserKv: Kv = {
  async get<T>(key: string) {
    const v = await tx<Saved<T> | undefined>(DATA, "readonly", (s) => s.get(key));
    return v ?? null;
  },
  async set(key, value) {
    await tx(DATA, "readwrite", (s) => s.put({ value, savedAt: Date.now() }, key));
  },
  clear: () => tx(DATA, "readwrite", (s) => s.clear()).then(() => {}),
};

export const browserBlobs: BlobStore = {
  async get(key) {
    return (await tx<Blob | undefined>(FILES, "readonly", (s) => s.get(key))) ?? null;
  },
  async has(key) {
    return (await tx<number>(FILES, "readonly", (s) => s.count(key))) > 0;
  },
  async put(key, blob) {
    await tx(FILES, "readwrite", (s) => s.put(blob, key));
  },
  clear: () => tx(FILES, "readwrite", (s) => s.clear()).then(() => {}),
};

export const WARM_KEY = "offline-warm";

/** Everything kept for offline use: data, photos, saved pages. Called on sign-out, so a shared phone keeps nothing. */
export async function clearOfflineData(): Promise<void> {
  await Promise.allSettled([
    browserKv.clear(),
    browserBlobs.clear(),
    typeof caches !== "undefined" ? caches.delete(PAGES_CACHE) : Promise.resolve(),
  ]);
  try { localStorage.removeItem(WARM_KEY); } catch { /* private mode */ }
}
