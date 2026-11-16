"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_COLS, trialState, type PlanRow, type TrialState } from "@/lib/plans";
import { formatDate, todayISO } from "@/lib/utils";

const seenKey = (uid: string) => `trial-ended-seen:${uid}`;

/** The free Pro month on Home: welcome with days left, a reminder in the last week, and one note after it ends. */
export function TrialBanner({ testId = "trial-banner" }: { testId?: string }) {
  const [info, setInfo] = useState<{ uid: string; t: TrialState } | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (!uid) return;
        const { data } = await supabase.from("user_plans").select(PLAN_COLS).eq("user_id", uid).maybeSingle();
        const t = trialState(data as Pick<PlanRow, "period" | "ends_on"> | null, todayISO());
        let seen = false;
        try { seen = t.state === "ended" && localStorage.getItem(seenKey(uid)) === "1"; } catch { /* storage blocked: show it */ }
        if (live && t.state !== "none" && !seen) setInfo({ uid, t });
      } catch { /* offline: no banner */ }
    })();
    return () => { live = false; };
  }, []);
  if (!info || hidden) return null;
  const { t } = info;
  const close = () => { try { localStorage.setItem(seenKey(info.uid), "1"); } catch { /* ignore */ } setHidden(true); };
  const days = `${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"} left`;
  const ends = t.endsOn ? formatDate(t.endsOn) : "";

  if (t.state === "active") return (
    <section aria-label="Free Pro month" className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 p-4 text-white" data-testid={testId} data-state="active">
      <div className="flex items-center gap-3"><Crown className="h-6 w-6 shrink-0 text-amber-200" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-[15.5px] font-extrabold">Pro is free for your first month</p><p className="text-[12.5px] opacity-90">Reports, Excel and PDF exports, bills by email. Ends {ends}.</p></div></div>
      <p className="mt-2 text-[12.5px] font-semibold opacity-95" data-testid="trial-days-left">{days}</p>
    </section>
  );
  if (t.state === "ending") return (
    <section aria-label="Free Pro month" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50" data-testid={testId} data-state="ending">
      <div className="flex items-center gap-3"><Crown className="h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-[15.5px] font-extrabold">Your free Pro month ends {t.daysLeft === 0 ? "today" : `in ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"}`}</p><p className="text-[12.5px]">Keep Reports and exports after {ends}.</p></div></div>
      <Link href="/personal/pro" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90" data-testid="trial-keep-pro"><Crown className="h-4 w-4" aria-hidden="true" />Keep Pro</Link>
    </section>
  );
  return (
    <section aria-label="Free Pro month" className="rounded-2xl border bg-card p-4" data-testid={testId} data-state="ended">
      <div className="flex items-start gap-3"><Crown className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-[15.5px] font-extrabold">Your free Pro month has ended</p><p className="text-[12.5px] text-muted-foreground">You are on Free. Everything you saved is still here.</p></div>
        <button type="button" onClick={close} aria-label="Close" className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent" data-testid="trial-close"><X className="h-5 w-5" aria-hidden="true" /></button></div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Still free: budget, groceries, subscriptions, documents, trips and your last 30 days total. Pro: reports by category and store, Excel and PDF exports, bills by email.</p>
      <Link href="/personal/pro" onClick={close} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90" data-testid="trial-get-pro"><Crown className="h-4 w-4" aria-hidden="true" />Get Pro</Link>
    </section>
  );
}
