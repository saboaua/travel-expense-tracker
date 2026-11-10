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
import { SUBSCRIPTION_COLS } from "@/lib/columns";
import { buildComingUp, type ComingUpItem } from "@/lib/personal/coming-up";

type Stats = ReturnType<typeof summarizePersonal> & { documents: number | null; cards: number | null };

export default function PersonalHubPage() {
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const { perms, loaded } = useAccess();
  const [comingUp, setComingUp] = useState<ComingUpItem[] | null>(null);
  // How many IPTV subscriptions an admin has assigned to this account. The tile is only shown when there is one.
  const [myIptv, setMyIptv] = useState(0);
  const wantsMyIptv = loaded && perms.has("iptv.mine"); // admins too: an admin can be a client of someone else's provider account
  useEffect(() => {
    if (!wantsMyIptv) return setMyIptv(0);
    let alive = true;
    createClient().rpc("my_iptv_subscriptions").then(({ data, error }) => {
      if (alive) setMyIptv(!error && Array.isArray(data) ? data.length : 0);
    });
    return () => { alive = false; };
  }, [wantsMyIptv]);
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

  // "Coming up" (desktop side panel): the soonest few payments, IPTV clients ending and trips; each part only for people who may see it
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const supabase = createClient();
    (async () => {
      const today = todayISO();
      const wantSubs = perms.has("subscriptions"), wantIptv = perms.has("iptv.manage"), wantTrips = perms.has("trips");
      const [subs, clients, customers, trips] = await Promise.all([
        wantSubs ? supabase.from("subscriptions").select(SUBSCRIPTION_COLS).eq("status", "active").limit(200) : null,
        wantIptv ? supabase.from("iptv_clients").select("id, customer_id, plan, expire_date").limit(500) : null,
        wantIptv ? supabase.from("iptv_customers").select("id, name").limit(500) : null,
        wantTrips ? supabase.from("trips").select("id, name, start_date").eq("status", "active").gte("start_date", today).order("start_date").limit(10) : null,
      ]);
      if (!alive) return;
      const names: Record<string, string> = {};
      for (const c of (customers?.data ?? []) as { id: string; name: string }[]) names[c.id] = c.name;
      setComingUp(buildComingUp({
        subs: ((subs?.data ?? []) as unknown as Parameters<typeof buildComingUp>[0]["subs"]),
        clients: (clients?.data ?? []) as never,
        customerNames: names,
        trips: (trips?.data ?? []) as never,
      }, today));
    })().catch(() => { if (alive) setComingUp([]); });
    return () => { alive = false; };
  }, [loaded, perms]);

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
    // Only people who manage IPTV clients (the admin, or a role given "IPTV clients") see this tile, and they do not also get the client tile below
    ...(wantsMyIptv && myIptv > 0 ? [{ href: "/my-subscription", title: "My IPTV subscription", icon: Repeat, stat: "See your service and when it ends" }] : []),
    ...(perms.has("loyalty") ? [{ href: "/personal/loyalty", title: "Loyalty cards", icon: CreditCard, stat: stats?.cards != null ? plural(stats.cards, "card") : "\u00a0", right: sharedCards != null && sharedCards > 0 ? `${sharedCards} shared` : "" }] : []),
  ];

  const iconBox = "flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary";
  const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8 lg:max-w-6xl">
      <PageHeader title="Personal" description="Track groceries, home projects and personal trips, and keep your documents and loyalty cards in one place." />

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="min-w-0 space-y-4">
      <p className={`${label} pt-2`}>Spending</p>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Groceries leads: the month total is the number, with the two things done most often one tap away */}
        <Card className="flex flex-col justify-between rounded-2xl lg:col-span-2 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex flex-col justify-between gap-1 lg:min-w-0 lg:flex-1">
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
          </div>
          <div className="flex gap-2 px-4 pb-4 md:px-5 md:pb-5 lg:w-64 lg:shrink-0 lg:flex-col lg:pl-0">
            <Link href="/personal/groceries/new" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:flex-none">
              <Camera className="h-4 w-4" aria-hidden="true" /> Scan receipt
            </Link>
            <Link href="/personal/groceries/prices" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent md:flex-none">
              <TrendingUp className="h-4 w-4" aria-hidden="true" /> Price tracker
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:contents">
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

      {/* Desktop only: what is coming up soonest. Phones and tablets keep the page as it is. */}
      <aside className="hidden space-y-4 lg:block" aria-label="Coming up" data-testid="coming-up">
        <p className={`${label} pt-2`}>Coming up</p>
        <Card className="rounded-2xl px-5 py-1">
          {comingUp === null ? (
            <p className="py-5 text-sm text-muted-foreground">&nbsp;</p>
          ) : comingUp.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">Nothing in the next few weeks.</p>
          ) : (
            <ul className="divide-y">
              {comingUp.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className="flex min-h-11 items-center gap-3 py-4 hover:opacity-80">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{i.title}</span><span className="block truncate text-[13px] text-muted-foreground">{i.subtitle}</span></span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${i.tone === "red" ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" : i.tone === "amber" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>{i.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="text-[13px] leading-relaxed text-muted-foreground">The soonest few payments, IPTV clients ending (admins) and trips.</p>
      </aside>
      </div>
    </div>
  );
}
