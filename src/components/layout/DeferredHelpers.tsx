"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * The helpers that show nothing on first paint (sending what was saved offline, keeping the offline copies fresh, the sharing popups)
 * load after the page has become usable, so their code (and the database library behind them) is not part of every page's first load.
 */
export function DeferredHelpers() {
  const [parts, setParts] = useState<ComponentType[]>([]);
  useEffect(() => {
    let off = false;
    const load = () => {
      Promise.all([
        import("@/components/OfflineSync").then((m) => m.OfflineSync),
        import("@/components/OfflineWarm").then((m) => m.OfflineWarm),
        import("@/components/sharing/SharingPopups").then((m) => m.SharingPopups),
      ])
        .then((list) => { if (!off) setParts(list); })
        .catch(() => { /* offline on a first visit: they load next time */ });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(load, { timeout: 1500 });
      return () => { off = true; w.cancelIdleCallback?.(id); };
    }
    const t = setTimeout(load, 600);
    return () => { off = true; clearTimeout(t); };
  }, []);
  return <>{parts.map((P, i) => <P key={i} />)}</>;
}
