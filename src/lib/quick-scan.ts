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
  try {
    const dataUrl = await toDataUrl(file);
    const s: Stored = { key, name: file.name, type: file.type, dataUrl, at: Date.now(), reason };
    sessionStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // storage full or blocked: caller falls back to the normal page
  }
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
