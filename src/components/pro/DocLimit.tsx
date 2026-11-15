"use client";

import Link from "next/link";
import { BellRing, Crown, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DocStatus } from "@/lib/limits";

/** Free plan documents: the count, what Pro adds, and a link to Get Pro. Shown only when the Free limit applies. */
export function DocLimitNotice({ status, pro, remindersLocked }: { status: DocStatus; pro: boolean; remindersLocked: boolean }) {
  if (status.limit == null) return null;
  return (
    <div className="space-y-3" data-testid="doc-limit">
      {status.full && (
        <Card><CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Lock className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{pro ? `You have reached the ${status.limit} documents Pro holds` : `Your Free plan holds ${status.limit} document${status.limit === 1 ? "" : "s"}`}</p>
              {!pro && <p className="text-sm text-muted-foreground">Pro holds more and sends expiry reminders to your phone.</p>}
              {pro && <p className="text-sm text-muted-foreground">Remove one you no longer need to add another.</p>}
            </div>
          </div>
          {!pro && <Link href="/personal/pro" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground" data-testid="doc-get-pro"><Crown className="h-5 w-5" aria-hidden="true" />Get Pro</Link>}
        </CardContent></Card>
      )}
      {remindersLocked && (
        <Card><CardContent className="flex items-center gap-3 py-4" data-testid="doc-reminders-locked">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Expiry reminders on your phone</p><p className="text-sm text-muted-foreground">A message before a passport or ID runs out</p></div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Pro</span>
        </CardContent></Card>
      )}
    </div>
  );
}
