"use client";

import { useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "app-icon-version-seen";
const CHECK_EVERY_MS = 30 * 60 * 1000;

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isApple = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * An iPhone copies the app icon once, when the app is added to the home screen, and never refreshes it.
 * So when the logo is changed later, people who installed the app are told in the app, with the steps to get the new icon.
 * The first time this runs on a phone it only remembers the icon version; a later change is what triggers the notice.
 */
export function IconUpdateNotice() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!isInstalled()) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { icon } = (await res.json()) as { icon?: string };
        if (!icon) return;
        const seen = localStorage.getItem(SEEN_KEY);
        if (!seen) localStorage.setItem(SEEN_KEY, icon);
        else if (seen !== icon) setLatest(icon);
      } catch {
        // Offline, or storage blocked: try again later.
      }
    };
    const first = setTimeout(check, 8_000);
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!latest) return null;

  const gotIt = () => {
    try {
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      // It will show again next time.
    }
    setLatest(null);
  };

  return (
    <div role="status" aria-live="polite" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] mx-auto max-w-md rounded-xl border bg-card p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0 md:bottom-4" data-testid="icon-update-notice">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ImageIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">The app icon has a new logo</p>
          {isApple() ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Your home screen still shows the old one. To update it: touch and hold the icon and remove it, open this site in Safari, tap Share, then Add to Home Screen.</p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">Your home screen may still show the old one. Remove the app and install it again to see the new logo.</p>
          )}
        </div>
        <button type="button" onClick={gotIt} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={gotIt}>Got it</Button>
      </div>
    </div>
  );
}
