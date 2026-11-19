"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { TrackId } from "@/lib/welcome";

const Tour = dynamic(() => import("@/components/welcome/WelcomeTour").then((m) => m.WelcomeTour), { ssr: false });

/** The welcome tour is shown once per person, so its code loads only when it is needed. The browser's install offer can arrive before it has loaded, so it is kept for the tour. */
export function WelcomeTourLoader(props: { userId: string; forced: boolean; home: { country: string; city: string }; tracks: TrackId[] }) {
  useEffect(() => {
    const keep = (e: Event) => { e.preventDefault(); (window as Window & { __earlyInstall?: Event }).__earlyInstall = e; };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);
  return <Tour {...props} />;
}
