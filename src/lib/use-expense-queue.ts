"use client";

import { useCallback, useEffect, useState } from "react";
import { browserStore, QUEUE_EVENT, type QueuedExpense } from "@/lib/offline-queue";

/** The expenses waiting on this device for the given person, kept up to date as the queue changes. */
export function useExpenseQueue(userId: string | null) {
  const [items, setItems] = useState<QueuedExpense[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return setItems([]);
    try {
      const all = await browserStore.list();
      setItems(all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt));
    } catch {
      setItems([]);
    }
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

  return { items, refresh };
}
