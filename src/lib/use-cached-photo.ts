"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { browserBlobs } from "@/lib/offline-store";

/**
 * A link to a private photo. The copy saved on the phone is used when there is one (instant, and works offline);
 * otherwise a signed link is made and a copy is saved for next time. Photo paths never change, so a copy never goes stale.
 */
export function useCachedPhoto(bucket: string, path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const key = `${bucket}/${path}`;
    (async () => {
      const blob = await browserBlobs.get(key).catch(() => null);
      if (cancelled) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        return setState({ path, url: objectUrl });
      }
      const { data } = await createClient().storage.from(bucket).createSignedUrl(path, 3600);
      if (cancelled || !data?.signedUrl) return;
      setState({ path, url: data.signedUrl });
      try {
        const res = await fetch(data.signedUrl);
        if (res.ok) await browserBlobs.put(key, await res.blob());
      } catch { /* the copy is a bonus */ }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bucket, path]);
  return path && state?.path === path ? state.url : null;
}
