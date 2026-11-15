"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_COLS, isProActive } from "@/lib/plans";
import { todayISO } from "@/lib/utils";

/** Whether this person has Pro today. null while it loads. Admins always have it. Offline or without the migration, it is free. */
export function usePro(): boolean | null {
  const [pro, setPro] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return live && setPro(false);
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).single();
        if (prof?.role === "admin") return live && setPro(true);
        const { data, error } = await supabase.from("user_plans").select(PLAN_COLS).eq("user_id", uid).maybeSingle();
        if (live) setPro(error ? false : isProActive(data as { plan: "pro"; ends_on: string | null } | null, todayISO()));
      } catch { if (live) setPro(false); }
    })();
    return () => { live = false; };
  }, []);
  return pro;
}
