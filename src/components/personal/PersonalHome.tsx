"use client";

import Link from "next/link";
import { Money } from "@/components/ui/money";
import { useEffect, useState } from "react";
import { Camera, Coins, CreditCard, Plus, Repeat, Tv, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccess } from "@/lib/use-access";
import { SUBSCRIPTION_COLS } from "@/lib/columns";
import { RenewalBar } from "@/components/subscriptions/RenewalBar";
import { approxUsd, cycleLabel, daysUntil, myShare, nextDue, totalsByCurrency, upcoming, type Sub } from "@/lib/subscriptions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { DocumentTiles, type DocTile } from "@/components/documents/DocumentTiles";
import type { DashboardProject, DashboardRow } from "@/lib/personal/dashboard";

import { BudgetCard } from "@/components/personal/BudgetCard";
import { ActiveTrips, HomeProjects } from "@/components/personal/HomeActive";
import { IconTile } from "@/components/ui/icon-tile";

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

/** Quick doors, only the ones this role has. */
function KeepHandy({ testId }: { testId: string }) {
  const { perms } = useAccess();
  const tile = "flex min-h-[56px] items-center justify-start gap-2.5 rounded-xl border text-left bg-card px-3.5 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const items = [
    // Scan and Upload already sit at the top of the home page, so the first door here is Quick spend
    { href: "/personal/spend", label: "Quick spend", icon: Coins, primary: true, show: perms.has("personal") },
    { href: "/personal/groceries/new", label: "Scan receipt", icon: Camera, primary: false, show: perms.has("personal") },
    { href: "/personal/subscriptions", label: "Add subscription", icon: Repeat, primary: false, show: perms.has("subscriptions") },
    { href: "/personal/loyalty", label: "Loyalty cards", icon: CreditCard, primary: false, show: perms.has("loyalty") },
  ].filter((i) => i.show);
  if (items.length === 0) return null;
  return (
    <section aria-label="Keep handy" data-testid={testId} className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keep handy</h2>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {items.map((i) => (
          <Link key={i.href + i.label} href={i.href} className={cn(tile, i.primary && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>
            <i.icon className={cn("h-5 w-5 shrink-0", !i.primary && "text-primary")} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-left leading-tight">{i.label}</span>
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
              <p className="text-2xl font-bold tabular-nums"><Money amount={usd} currency="USD" /><span className="text-sm font-medium text-muted-foreground"> / month (USD)</span></p>
            ) : (
              totals.map((t) => <p key={t.currency} className="text-xl font-bold tabular-nums"><Money amount={t.monthly} currency={t.currency} /><span className="text-sm font-medium text-muted-foreground"> / month</span></p>)
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

/** The IPTV service an admin assigned to this account. Nothing when there is none. */
function MyIptv() {
  const { perms, loaded } = useAccess();
  const [n, setN] = useState(0);
  const want = loaded && perms.has("iptv.mine");
  useEffect(() => {
    if (!want) return;
    let alive = true;
    createClient().rpc("my_iptv_subscriptions").then(({ data, error }) => { if (alive) setN(!error && Array.isArray(data) ? data.length : 0); });
    return () => { alive = false; };
  }, [want]);
  if (!want || n === 0) return null;
  return (
    <section aria-labelledby="home-iptv-h" data-testid="home-iptv" className="space-y-2">
      <h2 id="home-iptv-h" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IPTV</h2>
      <Link href="/my-subscription" className="flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <IconTile tone="subscriptions" className="h-11 w-11"><Tv className="h-5 w-5" /></IconTile>
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold">My IPTV subscription</span><span className="block text-[13px] text-muted-foreground">See your service and when it ends</span></span>
        <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
      </Link>
    </section>
  );
}

/**
 * The Personal dashboard: what is worth a daily look, in this order: Keep handy, the month budget, Active trips and their
 * travel advice, Projects, Documents, Subscriptions, and the IPTV service when an admin assigned one. A section with nothing
 * in it hides itself. Everything is set up in Personal > Organizer; the numbers and exports are in Personal > Reports.
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

  return (
    <div className="space-y-4">
      <KeepHandy testId="keep-handy" />
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-4">
          <BudgetCard />
          <ActiveTrips rows={rows} projects={projects} today={today} />
          <HomeProjects rows={rows} projects={projects} />
        </div>
        <div className="min-w-0 space-y-4">
          {canDocuments && <DocumentTiles tiles={docs} total={docTotal} idPrefix="personal-docs" gridClass="sm:grid-cols-2" />}
          <SubscriptionsCard subs={subs} today={today} testId="subs-card" />
          <MyIptv />
        </div>
      </div>
    </div>
  );
}
