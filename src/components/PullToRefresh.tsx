"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";

const TRIGGER = 70; // how far (px) the page must be pulled before letting go refreshes it
const MAX_PULL = 120;

/** True when the touch started somewhere that scrolls or drags on its own, so the gesture is not ours. */
function startsInsideSomethingElse(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.hasAttribute("data-no-pull")) return true;
    const style = getComputedStyle(el);
    if (style.position === "fixed") return true; // dialogs, menus, the photo cropper, the bottom bar
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
    if (scrollsY || scrollsX) return true;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Pull down from the top of any page to reload it, like a phone app. Phones only: it does nothing with a mouse,
 * and installed home-screen apps have no browser refresh of their own, which is why this exists.
 */
export function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineHint, setOfflineHint] = useState(false);
  const state = useRef({ startY: null as number | null, pulling: false, distance: 0 });

  useEffect(() => {
    const phone = window.matchMedia("(pointer: coarse) and (max-width: 767px)");
    if (!phone.matches) return;
    const s = state.current;

    const reset = () => {
      s.startY = null;
      s.pulling = false;
      s.distance = 0;
      setDistance(0);
    };

    const onStart = (e: TouchEvent) => {
      s.startY = null;
      if (e.touches.length !== 1 || window.scrollY > 0 || document.documentElement.scrollTop > 0) return;
      if (startsInsideSomethingElse(e.target)) return;
      s.startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (s.startY === null) return;
      const dy = e.touches[0].clientY - s.startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (s.pulling) reset();
        return;
      }
      s.pulling = true;
      if (e.cancelable) e.preventDefault(); // stops the page from bouncing while we show our own indicator
      s.distance = Math.min(dy * 0.5, MAX_PULL);
      setDistance(s.distance);
    };

    const onEnd = () => {
      if (!s.pulling) return reset();
      const enough = s.distance >= TRIGGER * 0.5 + 10;
      if (!enough) return reset();
      if (!navigator.onLine) {
        // Reloading with no signal would only show an error page.
        reset();
        setOfflineHint(true);
        setTimeout(() => setOfflineHint(false), 2000);
        return;
      }
      s.pulling = false;
      s.startY = null;
      setRefreshing(true);
      setDistance(48);
      window.location.reload();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  if (distance === 0 && !refreshing && !offlineHint) return null;

  const ready = distance >= TRIGGER * 0.5 + 10;
  const label = refreshing ? "Refreshing…" : offlineHint ? "You are offline" : ready ? "Release to refresh" : "Pull to refresh";
  const shown = offlineHint ? 48 : distance;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 z-[80] flex justify-center md:hidden"
      style={{ top: "env(safe-area-inset-top)", transform: `translateY(${Math.max(shown - 44, -44)}px)`, transition: distance === 0 || refreshing ? "transform 0.2s" : "none" }}
    >
      <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-lg">
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowDown className="h-4 w-4 transition-transform" style={{ transform: ready ? "rotate(180deg)" : "none" }} />
        )}
        {label}
      </div>
    </div>
  );
}
