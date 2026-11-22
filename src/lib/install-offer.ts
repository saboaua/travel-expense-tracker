/** Everything about offering "Add to Home Screen", in one place: the browser's install offer, whether the app is already installed, and once per sign-in. Browser only. */

type OfferWindow = Window & { __installOffer?: Event; __installOfferWired?: boolean };
export type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const INSTALLED_KEY = "pwa-installed";
const OFFERED_KEY = "pwa-install-offered";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export const isMobileDevice = (): boolean => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
export const isIosDevice = (): boolean => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Once the app has been opened from the home screen (or the browser says it was installed), this browser never offers it again. */
export const rememberInstalled = () => write(INSTALLED_KEY, "1");
export const wasInstalled = (): boolean => isStandalone() || read(INSTALLED_KEY) === "1";

/** Listen for the browser's install offer once, however many parts of the app ask. The offer can arrive before the part that wants it has loaded, so it is kept. */
export function wireInstallOffer(): void {
  const w = window as OfferWindow;
  if (w.__installOfferWired) return;
  w.__installOfferWired = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); w.__installOffer = e; window.dispatchEvent(new Event("install-offer")); });
  window.addEventListener("appinstalled", () => { w.__installOffer = undefined; rememberInstalled(); window.dispatchEvent(new Event("install-offer")); });
}
export const getInstallOffer = (): InstallOffer | null => ((window as OfferWindow).__installOffer as InstallOffer | undefined) ?? null;
export const clearInstallOffer = () => { (window as OfferWindow).__installOffer = undefined; };

/** True once per sign-in: the first call after each new sign-in says yes and remembers it; later calls, and page visits in the same sign-in, say no. */
export const offeredThisSignIn = (signInAt: string): boolean => read(OFFERED_KEY) === signInAt;
export const markOfferedThisSignIn = (signInAt: string) => write(OFFERED_KEY, signInAt);
