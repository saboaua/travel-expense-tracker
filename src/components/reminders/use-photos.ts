"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resizeLogo } from "@/lib/logo-image";

export type Photo = { key: string; id?: string; path?: string; file?: File; blob?: Blob; ext?: string; url: string | null };
const BUCKET = "reminder-photos";

/** The photos of one reminder: saved ones (shown through short-lived private links) and new ones waiting for Save. */
export function usePhotos(reminderId: string | null) {
  const [items, setItems] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const removed = useRef<Photo[]>([]);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    if (!reminderId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("reminder_photos").select("id, file_path").eq("reminder_id", reminderId).order("created_at");
      const rows = (data ?? []) as { id: string; file_path: string }[];
      const urls = rows.length ? await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.file_path), 3600) : { data: [] };
      setItems(rows.map((r, i) => ({ key: r.id, id: r.id, path: r.file_path, url: urls.data?.[i]?.signedUrl ?? null })));
    })();
  }, [reminderId]);
  useEffect(() => () => { previews.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const add = useCallback(async (files: File[], max: number) => {
    setError(null);
    for (const f of files) {
      if (items.length + 1 > max) { setError(`You can add up to ${max} photos.`); break; }
      try {
        const { blob, ext } = await resizeLogo(f, 1280);
        const url = URL.createObjectURL(blob);
        previews.current.push(url);
        setItems((cur) => (cur.length >= max ? cur : [...cur, { key: crypto.randomUUID(), blob, ext, url }]));
      } catch (e) { setError(e instanceof Error ? e.message : "This photo could not be read."); }
    }
  }, [items.length]);

  const remove = useCallback((p: Photo) => {
    setItems((cur) => cur.filter((x) => x.key !== p.key));
    if (p.id) removed.current.push(p);
  }, []);

  /** Saves new photos and deletes removed ones. Returns how many failed. */
  const commit = useCallback(async (rid: string, uid: string) => {
    const supabase = createClient();
    let failed = 0;
    for (const p of removed.current) {
      await supabase.from("reminder_photos").delete().eq("id", p.id!);
      if (p.path) await supabase.storage.from(BUCKET).remove([p.path]);
    }
    removed.current = [];
    for (const p of items.filter((x) => x.blob)) {
      const path = `${uid}/${rid}/${p.key}.${p.ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, p.blob!, { contentType: p.blob!.type, upsert: false });
      if (up.error) { failed++; continue; }
      const ins = await supabase.from("reminder_photos").insert({ reminder_id: rid, user_id: uid, file_path: path });
      if (ins.error) { failed++; await supabase.storage.from(BUCKET).remove([path]); }
    }
    return failed;
  }, [items]);

  return { items, error, add, remove, commit };
}
