"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/ui/page-header";
import { PersonalTabs } from "@/components/layout/PersonalTabs";
import { RecapView } from "@/components/personal/RecapView";
import { fetchRecap } from "@/lib/personal/recap-data";
import { recapMonth, monthName, type Recap } from "@/lib/personal/recap";
import { useCachedQuery } from "@/lib/use-cached-query";
import { todayISO } from "@/lib/utils";

/** The full recap of the month that just ended. The phone message opens this page. */
export function RecapPage() {
  const month = recapMonth(todayISO());
  const q = useCachedQuery<{ recap: Recap | null }>((uid) => `${uid}:recap:${month}`, async (sb) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { data: null, error: new Error("Sign in again to see this.") };
    return fetchRecap(sb, session.user.id, month);
  }, [month]);
  const recap = q.data?.recap ?? null;
  return (
    <PageShell size="form" className="space-y-4">
      <PageHeader title="Monthly recap" description={`How ${monthName(month)} went.`} />
      <PersonalTabs />
      {q.loading && !q.data ? <p className="py-6 text-center text-sm text-muted-foreground" data-testid="recap-loading">Adding up {monthName(month)}…</p>
        : q.error && !q.data ? <p className="py-6 text-center text-sm text-muted-foreground" role="alert">{q.error}</p>
        : recap ? <RecapView recap={recap} full />
        : (
          <div className="rounded-2xl border p-5 text-center" data-testid="recap-empty">
            <p className="font-semibold">Nothing recorded in {monthName(month)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Add receipts and spending during the month, and your recap shows here on the 1st.</p>
            <Link href="/personal/spend" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Add a quick spend</Link>
          </div>
        )}
    </PageShell>
  );
}
