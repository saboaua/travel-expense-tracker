/**
 * Hands a photo taken on the dashboard to the add-expense page without uploading it first.
 * The (already compressed) image waits in sessionStorage for a few minutes.
 */
const KEY = "quick-scan-v1";
const MAX_AGE_MS = 10 * 60 * 1000;

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function stashQuickScan(file: File, tripId: string): Promise<boolean> {
  try {
    const dataUrl = await toDataUrl(file);
    sessionStorage.setItem(KEY, JSON.stringify({ tripId, name: file.name, type: file.type, dataUrl, at: Date.now() }));
    return true;
  } catch {
    return false; // storage full or blocked: caller falls back to the normal add-expense page
  }
}

/** Returns the waiting photo for this trip (once) or null. */
export async function takeQuickScan(tripId: string): Promise<File | null> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const s = JSON.parse(raw) as { tripId: string; name: string; type: string; dataUrl: string; at: number };
    if (s.tripId !== tripId || Date.now() - s.at > MAX_AGE_MS) return null;
    const blob = await (await fetch(s.dataUrl)).blob();
    return new File([blob], s.name || "receipt.jpg", { type: s.type || blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}
