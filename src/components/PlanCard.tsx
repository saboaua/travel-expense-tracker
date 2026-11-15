"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Lock, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_COLS, planCardText, type PlanRow } from "@/lib/plans";
import { formatDate, todayISO } from "@/lib/utils";

/** Which plan this person has, on the Profile page. */
export function PlanCard() {
  const [info, setInfo] = useState<{ isAdmin: boolean; row: PlanRow | null } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return;
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).single();
        const { data } = await supabase.from("user_plans").select(PLAN_COLS).eq("user_id", uid).maybeSingle();
        if (live) setInfo({ isAdmin: prof?.role === "admin", row: (data as PlanRow | null) ?? null });
      } catch { /* offline: no card */ }
    })();
    return () => { live = false; };
  }, []);
  if (!info) return null;
  const t = planCardText({ isAdmin: info.isAdmin, row: info.row, today: todayISO() });
  const sub = info.row?.ends_on && t.pro && !t.admin ? t.sub.replace(info.row.ends_on, formatDate(info.row.ends_on)) : t.sub;
  return (
    <div className="mt-5 flex items-center gap-3 border-t pt-4" data-testid="plan-card">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.pro ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>{t.pro ? <Crown className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}</span>
      <div className="min-w-0 flex-1"><p className="text-[15px] font-extrabold" data-testid="plan-card-title">{t.title}</p><p className="text-xs text-muted-foreground">{t.pro ? sub : "Reports are a Pro feature"}</p></div>
      {t.admin ? (
        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11.5px] font-extrabold text-green-800 dark:bg-green-950 dark:text-green-200">Active</span>
      ) : (
        <Link href="/personal/pro" className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-bold ${t.pro ? "border bg-card hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90"}`} data-testid="plan-card-link">
          {t.pro ? <><Plus className="h-4 w-4" aria-hidden="true" />Add time</> : <><Crown className="h-4 w-4" aria-hidden="true" />Get Pro</>}
        </Link>
      )}
    </div>
  );
}
