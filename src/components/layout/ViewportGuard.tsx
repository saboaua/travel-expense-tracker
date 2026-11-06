"use client";

import { useEffect } from "react";

/**
 * On phones the app is a fixed frame whose bottom menu is part of the frame. iOS can still scroll the page itself
 * behind that frame (after the camera or photo picker closes, after a keyboard is dismissed, when the installed app
 * comes back from the background), which pushes the menu off the screen until the app is restarted.
 * This puts the page back at the top whenever that happens. It only touches the page, never the scrolling content area.
 */
export function ViewportGuard() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const snap = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    // The browser may settle a moment after the event, so check again shortly after
    const soon = () => {
      snap();
      setTimeout(snap, 120);
      setTimeout(snap, 400);
    };
    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    const vv = window.visualViewport;

    window.addEventListener("scroll", snap, { passive: true });
    window.addEventListener("resize", soon);
    window.addEventListener("orientationchange", soon);
    window.addEventListener("pageshow", soon);
    window.addEventListener("focus", soon);
    document.addEventListener("focusout", soon);
    document.addEventListener("change", soon, true); // a file chosen from the camera or library
    document.addEventListener("visibilitychange", onVisible);
    vv?.addEventListener("resize", soon);
    vv?.addEventListener("scroll", snap);
    return () => {
      window.removeEventListener("scroll", snap);
      window.removeEventListener("resize", soon);
      window.removeEventListener("orientationchange", soon);
      window.removeEventListener("pageshow", soon);
      window.removeEventListener("focus", soon);
      document.removeEventListener("focusout", soon);
      document.removeEventListener("change", soon, true);
      document.removeEventListener("visibilitychange", onVisible);
      vv?.removeEventListener("resize", soon);
      vv?.removeEventListener("scroll", snap);
    };
  }, []);
  return null;
}
