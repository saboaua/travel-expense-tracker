"use client";

import { useEffect } from "react";

/**
 * Publishes the height of the part of the screen that is really visible as --app-h.
 * On phones `inset: 0` and `100vh` can reach below the visible area (under the browser's bottom bar), which hid the
 * bottom menu and the buttons of full-screen popups. Frames that must fit the screen use `.app-frame` (globals.css).
 */
export function AppHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const set = () => {
      const vv = window.visualViewport;
      const h = Math.round(vv ? vv.height : window.innerHeight);
      if (h > 0) root.style.setProperty("--app-h", `${h}px`);
    };
    set();
    const vv = window.visualViewport;
    window.addEventListener("resize", set);
    window.addEventListener("orientationchange", set);
    window.addEventListener("pageshow", set);
    window.addEventListener("focus", set);
    document.addEventListener("visibilitychange", set);
    vv?.addEventListener("resize", set);
    return () => {
      window.removeEventListener("resize", set);
      window.removeEventListener("orientationchange", set);
      window.removeEventListener("pageshow", set);
      window.removeEventListener("focus", set);
      document.removeEventListener("visibilitychange", set);
      vv?.removeEventListener("resize", set);
    };
  }, []);
  return null;
}
