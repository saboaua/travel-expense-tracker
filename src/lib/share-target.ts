/** Where the service worker keeps a photo or PDF shared to the app from another app (public/sw.js); keep in step with SHARE in sw.js. */
export const SHARE_CACHE = "lifolio-share";
const SHARE_KEY = "/shared-file";

/** What the share sheet may send: a photo or a PDF. */
export const isShareable = (name: string, type: string): boolean => /^image\//i.test(type) || type === "application/pdf" || /\.(?:jpe?g|png|webp|heic|heif|pdf)$/i.test(name);

/** Takes the shared file (once: it is removed as it is read). Null when nothing was shared or it is not a photo or PDF. */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_KEY);
    await cache.delete(SHARE_KEY);
    if (!res) return null;
    const name = decodeURIComponent(res.headers.get("X-File-Name") || "shared");
    const type = res.headers.get("Content-Type") || "";
    if (!isShareable(name, type)) return null;
    const modified = Number(res.headers.get("X-Last-Modified"));
    return new File([await res.blob()], name, { type, lastModified: Number.isFinite(modified) && modified > 0 ? modified : Date.now() });
  } catch {
    return null;
  }
}
