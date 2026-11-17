"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_LIMITS, readLimits, selectLimits, type Limits, type Who } from "@/lib/limits";
import { PLAN_COLS, isProActive } from "@/lib/plans";
import { todayISO } from "@/lib/utils";

export type LimitsInfo = { limits: Limits; who: Who; uid: string };

/** The Pro limits and who this person is (Pro, admin or Free). null while it loads. Offline or without the migration: no limits. */
export function useLimits(): LimitsInfo | null {
  const [info, setInfo] = useState<LimitsInfo | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return;
        const [prof, lim, plan] = await Promise.all([
          supabase.from("profiles").select("role").eq("id", uid).single(),
          selectLimits((c) => supabase.from("pro_limits").select(c).eq("id", 1).maybeSingle()),
          supabase.from("user_plans").select(PLAN_COLS).eq("user_id", uid).maybeSingle(),
        ]);
        const admin = prof.data?.role === "admin";
        const pro = admin || (!plan.error && isProActive(plan.data as { plan: "pro"; ends_on: string | null } | null, todayISO()));
        if (live) setInfo({ limits: lim.error ? DEFAULT_LIMITS : readLimits(lim.data as unknown as Record<string, unknown> | null), who: { pro, admin }, uid });
      } catch { /* offline: nothing is limited */ }
    })();
    return () => { live = false; };
  }, []);
  return info;
}
