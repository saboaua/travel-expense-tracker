"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checklist, type ChecklistFacts } from "@/lib/welcome";
import { cn } from "@/lib/utils";

const HIDE_KEY = "getting-started-hidden";

/** The steps after the welcome tour. It stays on the dashboard until everything is done or it is hidden. */
export function GettingStarted({ userId, homeSet, tracksSet }: { userId: string; homeSet: boolean; tracksSet: boolean }) {
  const [hidden, setHidden] = useState(true); // hidden until storage is read, so it never flashes
  const [facts, setFacts] = useState<ChecklistFacts>({ homeSet, tracksSet, installed: false, hasReceipt: false, hasBudget: false, reminders: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setHidden(localStorage.getItem(`${HIDE_KEY}:${userId}`) === "1"); } catch { setHidden(false); }
  }, [userId]);

  useEffect(() => {
    if (hidden) return;
    let live = true;
    (async () => {
      const supabase = createClient();
      const any = async (table: string) => {
        const { data } = await supabase.from(table).select("id").limit(1);
        return Array.isArray(data) && data.length > 0;
      };
      const [groceries, spends, budget] = await Promise.all([any("grocery_receipts"), any("personal_spends"), any("personal_budgets")].map((p) => p.catch(() => false)));
      const nav = navigator as Navigator & { standalone?: boolean };
      const installed = window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
      const reminders = typeof Notification !== "undefined" && Notification.permission === "granted";
      if (live) { setFacts({ homeSet, tracksSet, installed, hasReceipt: groceries || spends, hasBudget: budget, reminders }); setLoaded(true); }
    })();
    return () => { live = false; };
  }, [hidden, homeSet, tracksSet]);

  const { items, done, all } = checklist(facts);
  if (hidden || !loaded || all) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(`${HIDE_KEY}:${userId}`, "1"); } catch { /* ignore */ } };

  return (
    <section className="rounded-3xl border border-blue-200 bg-card p-4 shadow-sm dark:border-blue-900" aria-label="Getting started" data-testid="getting-started">
      <div className="flex items-center gap-2.5">
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-primary">Getting started</div>
          <div className="mt-0.5 text-[17px] font-bold" data-testid="getting-started-count">{done} of {items.length} done</div>
        </div>
        <button type="button" onClick={hide} className="flex min-h-11 items-center px-1 text-[13px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="getting-started-hide">Hide</button>
      </div>
      <div className="mb-1.5 mt-2 h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Getting started progress"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <ul>
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 border-t py-1.5" data-done={i.done || undefined}>
            <span className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full", i.done ? "bg-green-600 text-white" : "border-2 border-input")} aria-hidden="true">{i.done && <Check className="h-4 w-4" />}</span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-[15px] font-semibold", i.done && "text-muted-foreground line-through")}>{i.title}</div>
              <div className="text-xs text-muted-foreground">{i.sub}</div>
            </div>
            {!i.done && i.href && <Link href={i.href} className="flex min-h-11 items-center px-1 text-[13px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${i.title}: ${i.cta}`}>{i.cta}</Link>}
          </li>
        ))}
      </ul>
      <Link href="/help" className="mt-1 flex min-h-11 items-center gap-2.5 border-t pt-1 text-sm text-muted-foreground hover:text-foreground">
        <BookOpen className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="flex-1"><b className="text-foreground">Stuck? Open Help.</b> Short guides, and the welcome tour again.</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
