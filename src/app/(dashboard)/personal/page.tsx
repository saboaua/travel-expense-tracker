"use client";

import { shiftMonth } from "@/lib/personal/utilities";
import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import type { IconTone } from "@/lib/icon-tones";
import { Fuel, PiggyBank, ShoppingCart, Hammer, Home, Plane, ChevronRight, FolderOpen, CreditCard, TrendingUp, Repeat, Coins, Zap, Landmark, Mail, Plus, Send, Tv, Wallet } from "lucide-react";
import { PersonalTabs } from "@/components/layout/PersonalTabs";
import { useAccess } from "@/lib/use-access";
import { useSharing } from "@/lib/use-sharing";
import { summarizePersonal } from "@/lib/personal/summary";
import { houseSpends, quickSpends, summarizeSpends, type SpendRow } from "@/lib/personal/quick-spend";
import { convert, convertedCount, dominantCurrency, round2, type BudgetCurrency } from "@/lib/personal/money";
import { fetchLinkedSpends, withLinkedTotals } from "@/lib/offline-personal";
import { formatCurrency, todayISO } from "@/lib/utils";
import { SUBSCRIPTION_COLS, withColumnFallback } from "@/lib/columns";
import { onlySpending } from "@/lib/personal/price-notes";
import { fetchSavings } from "@/lib/personal/savings-data";
import { savingsSummary } from "@/lib/personal/savings";
import { fuelSummary, type FuelRow } from "@/lib/personal/fuel";
import { buildComingUp, type ComingUpItem } from "@/lib/personal/coming-up";

type Stats = ReturnType<typeof summarizePersonal> & { documents: number | null; cards: number | null; spends: ReturnType<typeof summarizeSpends>; utilities: { total: number; count: number } | null; currency: BudgetCurrency; converted: number; house: { total: number; count: number } | null; savings: ReturnType<typeof savingsSummary> };

export default function PersonalHubPage() {
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const { perms, loaded } = useAccess();
  const [comingUp, setComingUp] = useState<ComingUpItem[] | null>(null);
  // This month's fuel fill-ups (null when the table is not there yet)
  const [fuel, setFuel] = useState<ReturnType<typeof fuelSummary> | null | undefined>(undefined);
  useEffect(() => {
    const monthStart = `${todayISO().slice(0, 7)}-01`;
    createClient().from("fuel_fillups").select("id, fill_date, unit, quantity, price_per_unit, amount, currency, amount_usd, station").gte("fill_date", monthStart).limit(500).then(({ data, error }) => setFuel(error ? null : fuelSummary((data ?? []) as unknown as FuelRow[], "AWG", "L")), () => setFuel(null));
  }, []);
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
      const nextMonthStart = shiftMonth(monthStart, 1);
      const [g, p, d, l, q, lk, u, sv] = await Promise.all([
        withColumnFallback((cols) => supabase.from("grocery_receipts").select(cols).gte("purchase_date", monthStart), "total, currency, prices_only", "total, currency").then((r) => onlySpending<{ total: number; currency: string }>(r)),
        supabase.from("personal_projects").select("id, kind, status, personal_expenses(amount_usd)").eq("status", "active"),
        supabase.from("travel_documents").select("id", { count: "exact", head: true }),
        supabase.from("loyalty_cards").select("id", { count: "exact", head: true }),
        supabase.from("personal_spends").select("id, merchant, amount, currency, amount_usd, category, expense_date, project_id, house_area").gte("expense_date", monthStart).limit(2000),
        fetchLinkedSpends(supabase),
        supabase.from("utility_bills").select("amount_usd").gte("paid_on", monthStart).lt("paid_on", nextMonthStart).limit(200),
        fetchSavings(supabase),
      ]);
      // One currency for the whole page: AWG or USD, whichever the month's receipts and spends use more
      const spendRows = (q.error ? [] : q.data ?? []) as unknown as SpendRow[];
      const money = [...((g.data ?? []) as { currency: string }[]), ...spendRows];
      const cur = dominantCurrency(money);
      const toCur = (usd: number) => round2(convert(usd, "USD", cur) ?? usd);
      const savings = sv.failed ? null : savingsSummary(sv.plans, sv.events, todayISO(), cur);
      const houseRows = houseSpends(spendRows, todayISO().slice(0, 7));
      const house = q.error ? null : { count: houseRows.length, total: round2(houseRows.reduce((t, r) => t + (convert(Number(r.amount), r.currency, cur, r.amount_usd == null ? null : Number(r.amount_usd)) ?? 0), 0)) };
      setStats({ ...summarizePersonal(g.data, withLinkedTotals((p.data ?? []) as { id?: string; personal_expenses?: { amount_usd: number | string | null }[] | null }[], lk) as never, cur), documents: d.error ? null : d.count ?? 0, cards: l.error ? null : l.count ?? 0, spends: q.error ? null : summarizeSpends(quickSpends(q.data as unknown as SpendRow[]), cur), utilities: u.error ? null : { total: toCur((u.data ?? []).reduce((t, r) => t + (Number((r as { amount_usd: number | string | null }).amount_usd) || 0), 0)), count: (u.data ?? []).length }, savings, currency: cur, converted: convertedCount(money, cur), house });
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
  const rowTiles: { href: string; title: string; icon: typeof ShoppingCart; tone: IconTone; text: string; strong: boolean }[] = [
    { href: "/personal/spend", title: "Quick spend", icon: Coins, tone: "spend", strong: !!stats?.spends,
      text: !stats ? "\u00a0" : stats.spends ? `${formatCurrency(stats.spends.total, stats.spends.currency)} this month \u00b7 ${plural(stats.spends.count, "spend")}` : "Coffee, street food, anything with no receipt" },
    { href: "/personal/fuel", title: "Fuel", icon: Fuel, tone: "projects", strong: !!fuel,
      text: fuel === undefined ? "\u00a0" : fuel ? `${formatCurrency(fuel.total, fuel.currency)} this month \u00b7 ${plural(fuel.count, "fill-up")}` : "What you spend each time you fill the tank" },
    { href: "/personal/house", title: "House & repairs", icon: Home, tone: "house", strong: !!stats?.house?.count,
      text: !stats ? "\u00a0" : stats.house?.count ? `${formatCurrency(stats.house.total, stats.currency)} this month \u00b7 ${plural(stats.house.count, "item")}` : "Repairs and fixes for the house" },
    { href: "/personal/savings", title: "Savings", icon: PiggyBank, tone: "savings", strong: !!stats?.savings,
      text: !stats ? "\u00a0" : stats.savings ? `${formatCurrency(stats.savings.saved, stats.savings.currency)} saved \u00b7 ${formatCurrency(stats.savings.monthly, stats.savings.currency)} a month` : "Put money aside every month" },
    { href: "/personal/utilities", title: "Utilities", icon: Zap, tone: "utilities", strong: !!stats?.utilities?.count,
      text: !stats ? "\u00a0" : stats.utilities?.count ? `${formatCurrency(stats.utilities.total, stats.currency)} paid this month \u00b7 ${plural(stats.utilities.count, "bill")}` : "Water, electricity, phone and more" },
    { href: "/personal/projects", title: "Projects", icon: Hammer, tone: "projects", strong: !!stats && stats.projects.count > 0,
      text: !stats ? "\u00a0" : stats.projects.count > 0 ? `${stats.projects.count} active \u00b7 ${formatCurrency(stats.projects.spent, stats.currency)} spent` : "No active projects \u00b7 tap to start one" },
    { href: "/personal/travel", title: "Personal Travel", icon: Plane, tone: "travel", strong: !!stats && stats.trips.count > 0,
      text: !stats ? "\u00a0" : stats.trips.count > 0 ? `${stats.trips.count} active \u00b7 ${formatCurrency(stats.trips.spent, stats.currency)} spent` : "No active trips \u00b7 tap to start one" },
  ];
  const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  type Row = { href: string; title: string; icon: typeof ShoppingCart; tone: IconTone; text: string; strong?: boolean; add?: { href: string; label: string; aria?: string }; right?: string; testId?: string };
  const money: Row[] = [
    { href: "/personal/budget", title: "Monthly budget", icon: Wallet, tone: "spend", text: "Set or change what you plan to spend each month" },
    { href: "/personal/fixed", title: "Fixed costs", icon: Landmark, tone: "fixed", text: "Loans, insurance, credit card and more, every month" },
    { href: "/personal/groceries", title: "Groceries", icon: ShoppingCart, tone: "groceries", strong: !!grocery,
      text: !stats ? "\u00a0" : grocery ? `${formatCurrency(grocery.total, grocery.currency)} this month \u00b7 ${plural(grocery.count, "receipt")}` : "Receipts and item prices", add: { href: "/personal/groceries/new", label: "Scan", aria: "Scan receipt" } },
    { href: "/personal/groceries/prices", title: "Price tracker", icon: TrendingUp, tone: "groceries", text: "Compare what the same item costs in different stores" },
    ...rowTiles.filter((t) => t.href === "/personal/spend" || t.href === "/personal/fuel" || t.href === "/personal/savings" || t.href === "/personal/utilities" || t.href === "/personal/house"),
  ];
  const track: Row[] = [
    ...(perms.has("subscriptions") ? [{ href: "/personal/subscriptions", title: "Subscriptions", icon: Repeat, tone: "subscriptions" as const, text: "Track what you pay and what is due", add: { href: "/personal/subscriptions", label: "Add" } }] : []),
    ...rowTiles.filter((t) => t.href === "/personal/projects").map((t) => ({ ...t, add: { href: "/personal/projects/new", label: "Add" } })),
    ...rowTiles.filter((t) => t.href === "/personal/travel").map((t) => ({ ...t, add: { href: "/personal/travel/new", label: "Add" } })),
    ...(perms.has("loyalty") ? [{ href: "/personal/loyalty", title: "Loyalty cards", icon: CreditCard, tone: "loyalty" as const, text: stats?.cards != null ? plural(stats.cards, "card") : "\u00a0", right: sharedCards != null && sharedCards > 0 ? `${sharedCards} shared` : "", add: { href: "/personal/loyalty", label: "Add" } }] : []),
    ...(perms.has("documents") ? [{ href: "/documents", title: "Documents", icon: FolderOpen, tone: "documents" as const, text: stats?.documents != null ? plural(stats.documents, "document") : "\u00a0", add: { href: "/documents", label: "Add" } }] : []),
    ...(wantsMyIptv && myIptv > 0 ? [{ href: "/my-subscription", title: "My IPTV subscription", icon: Tv, tone: "subscriptions" as const, text: "See your service and when it ends" }] : []),
  ];
  const auto: Row[] = [
    { href: "/personal/utilities/emails", title: "Bills by email", icon: Mail, tone: "utilities", text: "Add your bills from your inbox (Pro)" },
    { href: "/settings", title: "Telegram", icon: Send, tone: "notifications", text: "Reminders, and saving by chat (Pro)" },
  ];

  const group = (name: string, rows: Row[], id: string) => rows.length === 0 ? null : (
    <section aria-labelledby={id} className="space-y-2" data-testid={id}>
      <h2 id={id} className={`${label} pt-2`}>{name}</h2>
      <Card className="rounded-2xl px-4 py-1 md:px-5">
        <ul className="divide-y">
          {rows.map((t) => (
            <li key={t.href + t.title} className="flex items-center gap-2">
              <Link href={t.href} className="group flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5">
                <IconTile tone={t.tone} className="h-11 w-11"><t.icon className="h-[22px] w-[22px]" /></IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{t.title}</span>
                  <span className={`block text-[13px] ${t.strong ? "font-medium" : "text-muted-foreground"}`}>
                    {t.text}
                    {t.right ? <> {"\u00b7"} <span className="font-semibold text-primary" data-testid="tile-shared">{t.right}</span></> : null}
                  </span>
                </span>
                {!t.add && <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
              </Link>
              {t.add && <Link href={t.add.href} aria-label={t.add.aria ?? `${t.add.label} ${t.title.toLowerCase()}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border bg-card px-3 text-[13px] font-bold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t.add.label}</Link>}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8 lg:max-w-6xl">
      <PageHeader title="Personal" description="Set up everything here. Your dashboard shows what you add." />
      <PersonalTabs />
      <h2 className="sr-only">Organizer</h2>

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="min-w-0 space-y-4">
      <p className="rounded-xl bg-blue-50 px-3 py-2 text-[13px] leading-snug text-blue-900 dark:bg-blue-950 dark:text-blue-100" data-testid="organizer-note">
        Your dashboard reads from these lists. Add a project and it appears there. Remove the last one and it hides itself.
      </p>
      {stats && stats.converted > 0 && (
        <p className="flex gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[13px] leading-snug text-blue-900 dark:bg-blue-950 dark:text-blue-100" data-testid="hub-currency-note">
          Amounts in {stats.currency === "AWG" ? "USD" : "AWG"} are shown in {stats.currency} at the fixed rate, 1 USD = 1.79 AWG.
        </p>
      )}
      {group("Money", money, "org-money")}
      {group("Things you track", track, "org-track")}
      {group("Automatic", auto, "org-auto")}
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
