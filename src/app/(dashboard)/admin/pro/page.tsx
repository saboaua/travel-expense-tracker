"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, ChevronRight, CircleAlert, Gift, Scale, Users } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { trialSummary, type TrialSettings } from "@/lib/pro-trial";
import { limitsActive, type Limits } from "@/lib/limits";
import { cn } from "@/lib/utils";

type Overview = { today: string; proNow: number; ending: number; onTrial: number; waiting: number; limits: Limits; trial: TrialSettings };

export default function AdminProPage() {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/pro-overview");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) setError(json.error || "Could not load.");
      else setO(json);
    })();
  }, []);

  const rows = o ? [
    { href: "/admin/pro/people", icon: Users, tone: "people" as const, title: "People and access", sub: "Give or end Pro for one person", status: `${o.proNow} Pro`, status2: o.ending ? `${o.ending} ending` : "", id: "people" },
    { href: "/admin/pro/payments", icon: Banknote, tone: "money" as const, title: "Prices and payments", sub: "Prices, bank accounts, Bitcoin", status: o.waiting ? `${o.waiting} waiting` : "Nothing waiting", status2: "", id: "payments", alert: o.waiting > 0 },
    { href: "/admin/pro/limits", icon: Scale, tone: "fixed" as const, title: "Free plan limits", sub: "AI scans, documents, Pro-only features", status: `${o.limits.free_ai_scans} scans`, status2: limitsActive(o.limits, o.today) ? "On" : o.limits.starts_on ? `from ${o.limits.starts_on}` : "Not started", id: "limits" },
    { href: "/admin/pro/trial", icon: Gift, tone: "badges" as const, title: "Free Pro month", sub: "New accounts try Pro first", status: o.trial.mode === "off" ? "Off" : o.trial.mode === "always" ? "On" : "Dates", status2: o.trial.mode === "off" ? "" : `${o.trial.days} days`, id: "trial", good: o.trial.mode === "always" },
  ] : [];

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
      <BackLink href="/admin/settings">Admin</BackLink>
      <PageHeader title="Pro plan" description="Who has Pro, how they pay, and what Free gets" />
      {error && <Alert>{error}</Alert>}
      {!o && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {o && (
        <>
          {o.waiting > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50" data-testid="pro-waiting">
              <CircleAlert className="h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="text-[15px] font-extrabold">{o.waiting} payment{o.waiting === 1 ? "" : "s"} waiting</p><p className="text-[12.5px]">Check them and turn Pro on.</p></div>
              <Link href="/admin/pro/payments" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" data-testid="pro-review">Review</Link>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5" data-testid="pro-numbers">
            {([[o.proNow, "Pro now", "n-pro"], [o.ending, "End in 7 days", "n-ending"], [o.onTrial, "On free month", "n-trial"]] as const).map(([n, l, id]) => (
              <div key={l} className="rounded-2xl border bg-card p-3" data-testid={id}><p className="text-2xl font-extrabold">{n}</p><p className="text-xs leading-tight text-muted-foreground">{l}</p></div>
            ))}
          </div>
          <Card><CardContent className="divide-y p-0">
            {rows.map((r) => (
              <Link key={r.id} href={r.href} className="flex min-h-[68px] items-center gap-3 px-4 py-3 hover:bg-accent" data-testid={`pro-row-${r.id}`}>
                <IconTile tone={r.tone} className="h-11 w-11"><r.icon className="h-6 w-6" /></IconTile>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold">{r.title}</span><span className="block text-[12.5px] text-muted-foreground">{r.sub}</span></span>
                <span className={cn("text-right text-[12.5px] font-bold", r.alert ? "text-red-700" : r.good ? "text-green-700" : "text-muted-foreground")} data-testid={`pro-status-${r.id}`}>{r.status}{r.status2 && <><br />{r.status2}</>}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </CardContent></Card>
          <p className="text-xs text-muted-foreground" data-testid="pro-trial-line">Free Pro month: {trialSummary(o.trial, o.today)}</p>
        </>
      )}
    </div>
  );
}
