"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The colours offered for the Other row. The first is the default. */
export const OTHER_COLORS = ["#db2777", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#4f46e5", "#7c3aed", "#475569"] as const;
export const DEFAULT_OTHER_COLOR = OTHER_COLORS[0];

export const cleanOtherColor = (v: unknown): string => (typeof v === "string" && (OTHER_COLORS as readonly string[]).includes(v.toLowerCase()) ? v.toLowerCase() : DEFAULT_OTHER_COLOR);

/** The person's own colour for the Other row (profiles.other_color). Falls back to the default when none is saved or the column is not there yet. */
export function useOtherColor() {
  const [color, setColor] = useState<string>(DEFAULT_OTHER_COLOR);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const r = await sb.from("profiles").select("other_color").eq("id", user.id).single();
      if (alive && !r.error) setColor(cleanOtherColor((r.data as { other_color?: string | null } | null)?.other_color));
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (next: string) => {
    const prev = color;
    const c = cleanOtherColor(next);
    setColor(c);
    setError(null);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    const r = await sb.from("profiles").update({ other_color: c }).eq("id", user?.id ?? "");
    if (r.error) {
      setColor(prev);
      setError(/other_color/.test(r.error.message) ? "Run supabase/migration_other_color.sql in Supabase to save this colour." : "Could not save the colour. Try again.");
    }
  }, [color]);

  return { color, save, error };
}
