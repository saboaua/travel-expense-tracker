/**
 * Hands a photo from the dashboard (Scan / Upload) to the page that will read it, without uploading it first.
 * The (already compressed) image waits in sessionStorage for a few minutes. `key` says where it is going:
 * "trip:<id>", "project:<id>", "ptrip:<id>", "grocery" or "document" (see scan-destination.ts).
 *
 * `takeQuickScan` hands it over once. `peekQuickScan` leaves it in place, so the "Change" button on the
 * destination page can move the same photo somewhere else.
 */
const KEY = "quick-scan-v2";
const LAST_KEY = "scan-last-v1";
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The photo itself is also kept in memory, which survives moving between pages inside the app and has no size limit.
 * sessionStorage is the backup for a full page reload; a large photo can be too big for it (about 5 MB), and before
 * this the hand-off then silently failed and the next page opened empty.
 */
let memory: { key: string; file: File; at: number; consumed: boolean; reason: string | null } | null = null;

type Stored = { key: string; name: string; type: string; dataUrl: string; at: number; consumed?: boolean; reason?: string | null };

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function stashQuickScan(file: File, key: string, reason: string | null = null): Promise<boolean> {
  memory = { key, file, at: Date.now(), consumed: false, reason };
  try {
    const dataUrl = await toDataUrl(file);
    const s: Stored = { key, name: file.name, type: file.type, dataUrl, at: Date.now(), reason };
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the in-memory copy still carries the photo to the next page */
  }
  return true;
}

async function toFile(s: Stored): Promise<File> {
  const blob = await (await fetch(s.dataUrl)).blob();
  return new File([blob], s.name || "receipt.jpg", { type: s.type || blob.type || "image/jpeg" });
}

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return Date.now() - s.at > MAX_AGE_MS ? null : s;
  } catch {
    return null;
  }
}

/** Returns the waiting photo for this destination (once) or null. */
export async function takeQuickScan(key: string): Promise<File | null> {
  if (memory && memory.key === key && !memory.consumed && Date.now() - memory.at <= MAX_AGE_MS) {
    memory.consumed = true;
    return memory.file;
  }
  try {
    const s = read();
    if (!s || s.key !== key || s.consumed) return null;
    sessionStorage.setItem(KEY, JSON.stringify({ ...s, consumed: true }));
    return await toFile(s);
  } catch {
    return null;
  }
}

/** The photo and why it was sent here, without taking it. */
export async function peekQuickScan(key: string): Promise<{ file: File; reason: string | null } | null> {
  if (memory && memory.key === key && Date.now() - memory.at <= MAX_AGE_MS) return { file: memory.file, reason: memory.reason };
  try {
    const s = read();
    if (!s || s.key !== key) return null;
    return { file: await toFile(s), reason: s.reason ?? null };
  } catch {
    return null;
  }
}

export function getLastScanChoice(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastScanChoice(key: string) {
  try {
    localStorage.setItem(LAST_KEY, key);
  } catch {
    /* storage blocked: the suggestion just will not remember */
  }
}
