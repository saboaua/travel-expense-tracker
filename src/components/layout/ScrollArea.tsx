"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const SCROLL_AREA_ID = "app-scroll";

/** The element that scrolls on phones (the page itself stays still, so the bottom menu cannot drift). */
export function scrollAreaOrWindow(): { scrollTop: number; scrollTo: (o: ScrollToOptions) => void } {
  const el = typeof document !== "undefined" ? document.getElementById(SCROLL_AREA_ID) : null;
  return el && el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "visible" ? el : { scrollTop: window.scrollY, scrollTo: (o) => window.scrollTo(o) };
}

/** Page content. On phones it is the scrolling area between the top of the screen and the bottom menu. */
export function ScrollArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Opening another page starts at the top, as it does when the whole page scrolls
  useEffect(() => {
    document.getElementById(SCROLL_AREA_ID)?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div id={SCROLL_AREA_ID} className="max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-y-contain print:!overflow-visible md:pl-64">
      {children}
    </div>
  );
}
