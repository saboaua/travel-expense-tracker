"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ShoppingCart, Hammer, Plane, ChevronRight, FolderOpen, CreditCard, Camera, TrendingUp, Repeat } from "lucide-react";
import { useAccess } from "@/lib/use-access";
import { useSharing } from "@/lib/use-sharing";
import { summarizePersonal } from "@/lib/personal/summary";
import { formatCurrency, todayISO } from "@/lib/utils";

type Stats = ReturnType<typeof summarizePersonal> & { documents: number | null; cards: number | null };

export default function PersonalHubPage() {
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const { perms } = useAccess();
  // Cards partners share with me, shown on the right of the Loyalty cards tile (the left side is my own cards)
  const { overview } = useSharing();
  const [sharedCards, setSharedCards] = useState<number | null>(null);
  const sharingLive = !!overview && overview.available && overview.enabled;
  useEffect(() => {
    if (!sharingLive) return setSharedCards(null);
    let alive = true;
    fetch("/api/sharing/loyalty", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { cards: [] }))
      .then((d: { cards?: unknown[] }) => { if (alive) setSharedCards(Array.isArray(d.cards) ? d.cards.length : 0); })
      .catch(() => { if (alive) setSharedCards(null); });
    return () => { alive = false; };
  }, [sharingLive, overview]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
      if (flag && flag.personal_enabled === false) return setEnabled(false);

      const monthStart = `${todayISO().slice(0, 7)}-01`;
      const [g, p, d, l] = await Promise.all([
        supabase.from("grocery_receipts").select("total, currency").gte("purchase_date", monthStart),
        supabase.from("personal_projects").select("kind, status, personal_expenses(amount_usd)").eq("status", "active"),
        supabase.from("travel_documents").select("id", { count: "exact", head: true }),
        supabase.from("loyalty_cards").select("id", { count: "exact", head: true }),
      ]);
      setStats({ ...summarizePersonal(g.data, p.data as never), documents: d.error ? null : d.count ?? 0, cards: l.error ? null : l.count ?? 0 });
    })();
  }, []);

  if (!enabled) return <div className="p-8 text-sm text-muted-foreground">The Personal section is turned off by your administrator.</div>;

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const grocery = stats?.grocery ?? null;
  const rowTiles: { href: string; title: string; icon: typeof ShoppingCart; text: string; strong: boolean }[] = [
    { href: "/personal/projects", title: "Home Projects", icon: Hammer, strong: !!stats && stats.projects.count > 0,
      text: !stats ? "\u00a0" : stats.projects.count > 0 ? `${stats.projects.count} active \u00b7 ${formatCurrency(stats.projects.spent, "USD")} spent` : "No active projects \u00b7 tap to start one" },
    { href: "/personal/travel", title: "Personal Travel", icon: Plane, strong: !!stats && stats.trips.count > 0,
      text: !stats ? "\u00a0" : stats.trips.count > 0 ? `${stats.trips.count} active \u00b7 ${formatCurrency(stats.trips.spent, "USD")} spent` : "No active trips \u00b7 tap to start one" },
  ];
  const handy: { href: string; title: string; icon: typeof ShoppingCart; stat: string; right?: string }[] = [
    ...(perms.has("documents") ? [{ href: "/documents", title: "Documents", icon: FolderOpen, stat: stats?.documents != null ? plural(stats.documents, "document") : "\u00a0" }] : []),
    ...(perms.has("subscriptions") ? [{ href: "/personal/subscriptions", title: "Subscriptions", icon: Repeat, stat: "Track what you pay and what is due" }] : []),
    ...(perms.has("iptv.mine") ? [{ href: "/my-subscription", title: "My IPTV subscription", icon: Repeat, stat: "See your service and when it ends" }] : []),
    ...(perms.has("loyalty") ? [{ href: "/personal/loyalty", title: "Loyalty cards", icon: CreditCard, stat: stats?.cards != null ? plural(stats.cards, "card") : "\u00a0", right: sharedCards != null && sharedCards > 0 ? `${sharedCards} shared` : "" }] : []),
  ];

  const iconBox = "flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary";
  const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <PageHeader title="Personal" description="Track groceries, home projects and personal trips, and keep your documents and loyalty cards in one place." />

      <p className={`${label} pt-2`}>Spending</p>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Groceries leads: the month total is the number, with the two things done most often one tap away */}
        <Card className="flex flex-col justify-between rounded-2xl">
          <Link href="/personal/groceries" className="group flex items-center gap-3 p-4 pb-2 md:p-5 md:pb-2">
            <span className={`${iconBox} h-11 w-11`}><ShoppingCart className="h-[22px] w-[22px]" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-snug">Groceries</h2>
              <span className="block text-[13px] text-muted-foreground">Receipts, item prices, monthly spending</span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <div className="flex items-baseline justify-between gap-3 px-4 pb-3.5 md:px-5">
            {grocery ? (
              <>
                <p className="text-[26px] font-bold tabular-nums tracking-tight">{formatCurrency(grocery.total, grocery.currency)} <span className="text-sm font-medium text-muted-foreground">this month</span></p>
                <p className="shrink-0 text-[13px] text-muted-foreground">{plural(grocery.count, "receipt")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{stats ? "Nothing this month yet" : "\u00a0"}</p>
            )}
          </div>
          <div className="flex gap-2 px-4 pb-4 md:px-5 md:pb-5">
            <Link href="/personal/groceries/new" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:flex-none">
              <Camera className="h-4 w-4" aria-hidden="true" /> Scan receipt
            </Link>
            <Link href="/personal/groceries/prices" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent md:flex-none">
              <TrendingUp className="h-4 w-4" aria-hidden="true" /> Price tracker
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {rowTiles.map((t) => (
            <Link key={t.href} href={t.href} className="group block md:flex-1">
              <Card className="flex min-h-[72px] items-center gap-3 rounded-2xl px-4 py-3 transition-shadow group-hover:shadow-md md:h-full md:px-5">
                <span className={`${iconBox} h-11 w-11`}><t.icon className="h-[22px] w-[22px]" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold leading-snug">{t.title}</h2>
                  <span className={`block text-[13px] ${t.strong ? "font-medium" : "text-muted-foreground"}`}>{t.text}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {handy.length > 0 && (
        <>
          <p className={`${label} pt-2`}>Keep handy</p>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {handy.map((t) => (
              <Link key={t.href} href={t.href} className="group block">
                <Card className="flex h-full min-h-[104px] flex-col justify-between gap-2.5 rounded-2xl p-3.5 transition-shadow group-hover:shadow-md md:min-h-[72px] md:flex-row md:items-center md:gap-3 md:px-5 md:py-3">
                  <span className="flex items-center justify-between md:contents">
                    <span className={`${iconBox} h-10 w-10`}><t.icon className="h-5 w-5" aria-hidden="true" /></span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground md:order-last" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 md:flex-1">
                    <h2 className="text-[15px] font-semibold leading-snug">{t.title}</h2>
                    <span className="block text-[13px] text-muted-foreground">
                      {t.stat}
                      {t.right ? <> {"\u00b7"} <span className="font-semibold text-primary" data-testid="tile-shared">{t.right}</span></> : null}
                    </span>
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
