"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Camera, CreditCard, Hammer, Plus, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccess } from "@/lib/use-access";
import { SUBSCRIPTION_COLS } from "@/lib/columns";
import { RenewalBar } from "@/components/subscriptions/RenewalBar";
import { approxUsd, cycleLabel, daysUntil, myShare, nextDue, totalsByCurrency, upcoming, type Sub } from "@/lib/subscriptions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { DocumentTiles, type DocTile } from "@/components/documents/DocumentTiles";
import type { DashboardProject, DashboardRow } from "@/lib/personal/dashboard";

const PersonalDashboard = dynamic(() => import("@/components/personal/PersonalDashboard"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-muted-foreground">Loading your personal dashboard…</p>,
});

const CARD = "rounded-2xl border bg-card p-4 shadow-sm";
const heading = "text-lg font-bold";
const seeAll = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** How soon, as the short pill on a row. */
function duePill(days: number): { text: string; cls: string } {
  const text = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
  if (days <= 3) return { text, cls: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200" };
  if (days <= 7) return { text, cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" };
  return { text, cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" };
}

/** Quick doors, only the ones this role has. Shown at the top on a phone and in the side rail on a desktop. */
function KeepHandy({ testId }: { testId: string }) {
  const { perms } = useAccess();
  const tile = "flex min-h-[52px] items-center gap-2.5 rounded-xl border bg-card px-3.5 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const items = [
    { href: "/personal/groceries/new", label: "Scan receipt", icon: Camera, primary: true, show: perms.has("personal") },
    { href: "/personal/subscriptions", label: "Add subscription", icon: Repeat, primary: false, show: perms.has("subscriptions") },
    { href: "/personal/loyalty", label: "Loyalty cards", icon: CreditCard, primary: false, show: perms.has("loyalty") },
    { href: "/personal/projects", label: "Home projects", icon: Hammer, primary: false, show: perms.has("personal") },
  ].filter((i) => i.show);
  if (items.length === 0) return null;
  return (
    <section aria-label="Keep handy" data-testid={testId} className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keep handy</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((i) => (
          <Link key={i.href + i.label} href={i.href} className={cn(tile, i.primary && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>
            <i.icon className={cn("h-5 w-5 shrink-0", !i.primary && "text-primary")} aria-hidden="true" />
            <span className="min-w-0 leading-tight">{i.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** What you pay each month and what is due next. Null while loading or when the role has no subscriptions. */
function SubscriptionsCard({ subs, today, testId }: { subs: Sub[] | null; today: string; testId: string }) {
  if (subs === null) return null;
  const totals = totalsByCurrency(subs, today);
  const usd = approxUsd(totals);
  const next = upcoming(subs, today, 365).slice(0, 3);
  return (
    <section aria-labelledby={`${testId}-h`} data-testid={testId} className={cn(CARD, "space-y-3")}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${testId}-h`} className={heading}>Subscriptions</h2>
        <Link href="/personal/subscriptions" className={seeAll}>See all</Link>
      </div>
      {subs.length === 0 ? (
        <Link href="/personal/subscriptions" className="flex min-h-[5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center text-muted-foreground hover:border-primary hover:text-foreground">
          <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">Add a subscription</span>
          <span className="text-xs">Track what you pay and when it is due</span>
        </Link>
      ) : (
        <>
          <div>
            {usd != null ? (
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(usd, "USD")}<span className="text-sm font-medium text-muted-foreground"> / month (USD)</span></p>
            ) : (
              totals.map((t) => <p key={t.currency} className="text-xl font-bold tabular-nums">{formatCurrency(t.monthly, t.currency)}<span className="text-sm font-medium text-muted-foreground"> / month</span></p>)
            )}
            <p className="text-xs text-muted-foreground">{subs.length === 1 ? "1 active subscription" : `${subs.length} active subscriptions`}</p>
          </div>
          <ul className="divide-y" data-testid={`${testId}-rows`}>
            {next.map((s) => {
              const pill = duePill(daysUntil(s, today));
              return (
                <li key={s.id} className="flex min-h-[52px] items-center gap-2.5 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{formatCurrency(myShare(s), s.currency)} {cycleLabel(s.cycle).toLowerCase()}</span>
                    <RenewalBar s={s} today={today} />
                    <span className="mt-0.5 block text-xs text-muted-foreground">Renews {formatDate(nextDue(s, today))}</span>
                  </span>
                  <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", pill.cls)}>{pill.text}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The Personal dashboard: on a phone one column (keep handy, spending, trips, subscriptions, documents, then the detail);
 * from 1024px a main column and a side rail (subscriptions and keep handy).
 */
export default function PersonalHome({ rows, projects, today, docs, docTotal, canDocuments }: {
  rows: DashboardRow[];
  projects: DashboardProject[];
  today: string;
  docs: DocTile[];
  docTotal: number;
  canDocuments: boolean;
}) {
  const { perms, loaded } = useAccess();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const wantSubs = loaded && perms.has("subscriptions");

  useEffect(() => {
    if (!wantSubs) return;
    let alive = true;
    createClient().from("subscriptions").select(SUBSCRIPTION_COLS).eq("status", "active").limit(200).then(({ data, error }) => {
      if (alive) setSubs(error ? null : ((data ?? []) as unknown as Sub[]));
    });
    return () => { alive = false; };
  }, [wantSubs]);

  const afterTrips = useMemo(
    () => (
      <>
        <div className="lg:hidden"><SubscriptionsCard subs={subs} today={today} testId="subs-card-mobile" /></div>
        {canDocuments && <DocumentTiles tiles={docs} total={docTotal} idPrefix="personal-docs" gridClass="sm:grid-cols-2 lg:grid-cols-3" />}
      </>
    ),
    [subs, today, docs, docTotal, canDocuments],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-4">
        <div className="lg:hidden"><KeepHandy testId="keep-handy-mobile" /></div>
        <PersonalDashboard rows={rows} projects={projects} today={today} afterTrips={afterTrips} />
      </div>
      <aside aria-label="Subscriptions and shortcuts" className="hidden space-y-4 lg:sticky lg:top-6 lg:block">
        <SubscriptionsCard subs={subs} today={today} testId="subs-card-desktop" />
        <KeepHandy testId="keep-handy-desktop" />
      </aside>
    </div>
  );
}
