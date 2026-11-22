"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanTileColors, tileColor, withTileColor, type TileColors, type TileId } from "@/lib/tile-colors";

/** The person's own icon colours (profiles.tile_colors). Empty when none are saved or the column is not there yet. */
export function useTileColors() {
  const [colors, setColors] = useState<TileColors>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const r = await sb.from("profiles").select("tile_colors").eq("id", user.id).single();
      if (alive && !r.error) setColors(cleanTileColors((r.data as { tile_colors?: unknown } | null)?.tile_colors));
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (id: TileId, color: string | null) => {
    const prev = colors;
    const next = withTileColor(colors, id, color);
    setColors(next);
    setError(null);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    const r = await sb.from("profiles").update({ tile_colors: next }).eq("id", user?.id ?? "");
    if (r.error) {
      setColors(prev);
      setError(/tile_colors/.test(r.error.message) ? "Run supabase/migration_tile_colors.sql in Supabase to save colours." : "Could not save the colour. Try again.");
    }
  }, [colors]);

  return { colors, colorOf: (id: TileId) => tileColor(colors, id), save, error };
}
