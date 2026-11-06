"use client";

import { useCallback, useEffect, useState } from "react";
import { browserOutbox, QUEUE_EVENT, type OutboxItem } from "@/lib/outbox";

/** Everything waiting on this device for the given person (any kind), oldest first, kept up to date as the outbox changes. */
export function useOutbox(userId: string | null) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return setItems([]); // not known yet: "loaded" stays false, so no screen says "nothing is waiting" too early
    try {
      const all = await browserOutbox.list();
      setItems(all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt));
    } catch {
      setItems([]);
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { items, loaded, refresh };
}
