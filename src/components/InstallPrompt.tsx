"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { clearInstallOffer, getInstallOffer, isIosDevice, isMobileDevice, markOfferedThisSignIn, offeredThisSignIn, rememberInstalled, wasInstalled, wireInstallOffer, type InstallOffer } from "@/lib/install-offer";

const MANUAL = "Open the browser menu (⋮ or ⋯) and choose “Install app” or “Add to Home screen”.";

/**
 * The "Add to Home Screen" tip. It shows once after you sign in, and only when the app is not on your home screen yet.
 * Visiting a page, signing out, or opening the app from the home screen never shows it. The welcome tour has its own install step,
 * so when the tour is on screen this tip is skipped for that sign-in.
 */
export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [offer, setOffer] = useState<InstallOffer | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [signInAt, setSignInAt] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // Keep the browser's install offer (one shared listener) and learn when the app gets installed
  useEffect(() => {
    wireInstallOffer();
    if (isMobileDevice() && wasInstalled()) rememberInstalled();
    const sync = () => { setOffer(getInstallOffer()); if (wasInstalled()) setShow(false); };
    sync();
    window.addEventListener("install-offer", sync);
    return () => window.removeEventListener("install-offer", sync);
  }, []);

  // Which sign-in is this? Only a signed-in person can be offered the tip
  useEffect(() => {
    if (!isMobileDevice() || wasInstalled()) return;
    setIos(isIosDevice());
    const sb = createClient();
    let alive = true;
    const read = () => sb.auth.getUser().then(({ data }) => { if (alive) setSignInAt(data.user?.last_sign_in_at ?? null); }, () => {});
    void read();
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") void read(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Stay out of the way of a bottom sheet, and of the welcome tour (it has its own install step)
  useEffect(() => {
    const check = () => {
      const tour = !!document.querySelector('[data-testid="welcome-tour"]');
      if (tour && signInAt) markOfferedThisSignIn(signInAt);
      setBlocked(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (tour) setShow(false);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [signInAt]);

  // Decide once per sign-in
  useEffect(() => {
    if (!signInAt || blocked || show) return;
    if (wasInstalled() || offeredThisSignIn(signInAt)) return;
    // A moment's wait so the welcome tour, which loads a little later, can claim this sign-in first
    const t = window.setTimeout(() => {
      if (document.querySelector('[data-testid="welcome-tour"]') || offeredThisSignIn(signInAt)) return;
      markOfferedThisSignIn(signInAt);
      setShow(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [signInAt, blocked, show]);

  const install = async () => {
    setHint(null);
    if (ios) { setHint("Tap the Share button (square with arrow) at the bottom of Safari, then tap “Add to Home Screen”."); return; }
    const ev = offer ?? getInstallOffer();
    if (!ev) { setHint(MANUAL); return; }
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      clearInstallOffer();
      setOffer(null);
      if (outcome === "accepted") { rememberInstalled(); setShow(false); }
    } catch { setHint(MANUAL); }
  };

  if (!show || blocked) return null;

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto max-w-md md:bottom-4 rounded-xl border bg-card shadow-lg p-4 flex flex-col gap-3" data-testid="install-tip">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {ios ? <Share className="h-5 w-5 text-primary" /> : <Download className="h-5 w-5 text-primary" />}
          </div>
          <div>
            <p className="font-medium text-sm">Add to Home Screen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hint || (ios ? "Tap below for steps, or use the Share button." : "Install the app for quick access and a full-screen experience.")}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setShow(false)} className="p-1 rounded-lg text-muted-foreground hover:bg-accent" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button size="sm" onClick={install} className="w-full">
        {ios ? "How to add" : "Add to Home Screen"}
      </Button>
    </div>
  );
}
