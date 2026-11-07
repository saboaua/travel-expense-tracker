"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { browserKv, loadWithCache } from "@/lib/offline-store";
import { SYNCED_EVENT } from "@/lib/outbox";

/**
 * Loads something for a screen and keeps a copy on the phone, so the screen opens with no connection. Loads again when
 * something that was waiting has been sent. `key` is made from the signed-in person's id, so copies are never shared.
 */
export function useCachedQuery<T>(key: (userId: string) => string, run: (supabase: SupabaseClient) => PromiseLike<{ data: T | null; error: unknown }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const latest = useRef({ key, run });
  latest.current = { key, run };

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession(); // read from the phone, so it works offline
    const uid = session?.user.id;
    if (!uid) { setError("Sign in again to see this."); setLoading(false); return; }
    setUserId(uid);
    const res = await loadWithCache<T>(browserKv, latest.current.key(uid), () => latest.current.run(supabase));
    if (res.ok) { setData(res.data); setError(null); setSavedAt(res.fromCache ? res.savedAt : null); }
    else {
      const message = (res.error as { message?: string } | null)?.message || "Could not load.";
      setError(/relation|schema cache/i.test(message) ? "Personal tables not found. Run supabase/migration_personal.sql in Supabase." : message);
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads when what is being asked for changes
  useEffect(() => { setLoading(true); reload(); }, [reload, ...deps]);
  useEffect(() => {
    window.addEventListener(SYNCED_EVENT, reload);
    return () => window.removeEventListener(SYNCED_EVENT, reload);
  }, [reload]);

  return { data, loading, error, savedAt, userId, reload };
}
