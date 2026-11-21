"use client";

import { useEffect } from "react";
import { appHeight, standaloneHeight } from "@/lib/app-height";

/**
 * Publishes the height of the part of the screen that is really visible as --app-h.
 * On phones `inset: 0` and `100vh` can reach below the visible area (under the browser's bottom bar), which hid the
 * bottom menu and the buttons of full-screen popups. Frames that must fit the screen use `.app-frame` (globals.css).
 * When the installed app comes back from the background iOS first reports a wrong height, so it is measured again a few times.
 */
export function AppHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const el = document.activeElement as HTMLElement | null;
      const editing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      let h = appHeight(window.visualViewport?.height, window.innerHeight, editing);
      // Installed iPhone app: the window height leaves out the status bar strip the app now paints under
      if ((navigator as Navigator & { standalone?: boolean }).standalone) {
        const full = standaloneHeight(window.screen.width, window.screen.height, window.matchMedia("(orientation: landscape)").matches, editing);
        if (full > h) h = full;
      }
      if (h > 0) root.style.setProperty("--app-h", `${h}px`);
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const again = () => {
      set();
      timers.splice(0).forEach(clearTimeout);
      for (const ms of [80, 250, 600, 1200, 2500]) timers.push(setTimeout(set, ms));
    };
    const onVisible = () => { if (document.visibilityState === "visible") again(); };
    set();
    const vv = window.visualViewport;
    window.addEventListener("resize", set);
    window.addEventListener("orientationchange", again);
    window.addEventListener("pageshow", again);
    window.addEventListener("focus", again);
    document.addEventListener("focusout", again);
    document.addEventListener("visibilitychange", onVisible);
    vv?.addEventListener("resize", set);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", set);
      window.removeEventListener("orientationchange", again);
      window.removeEventListener("pageshow", again);
      window.removeEventListener("focus", again);
      document.removeEventListener("focusout", again);
      document.removeEventListener("visibilitychange", onVisible);
      vv?.removeEventListener("resize", set);
    };
  }, []);
  return null;
}
