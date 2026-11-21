"use client";

import { useEffect } from "react";
import { ImageIcon } from "lucide-react";

/**
 * White screen with a loading animation while the installed app opens. The markup is in the first HTML the server sends,
 * so it paints before the app code loads; it only shows when launched from the home screen (see globals.css) and
 * fades away once the app is ready. A CSS timer removes it even if the scripts never start.
 */
export function AppSplash({ logoUrl, appName, primaryColor }: { logoUrl?: string | null; appName: string; primaryColor?: string | null }) {
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el) return;
    // Hide it instead of deleting it: React owns this element, so removing it from the page could upset React later
    el.classList.add("app-splash-done");
    const t = window.setTimeout(() => el.classList.add("app-splash-gone"), 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div id="app-splash" aria-hidden="true" style={primaryColor ? ({ "--splash-accent": primaryColor } as React.CSSProperties) : undefined}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="app-splash-logo" src={logoUrl} alt="" />
      ) : (
        <span className="app-splash-ph"><ImageIcon size={36} strokeWidth={1.6} /></span>
      )}
      <div className="app-splash-name">{appName}</div>
      <span className="app-splash-dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
