"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ShoppingCart, Hammer, Plane, ChevronRight, Lock, FolderOpen, CreditCard } from "lucide-react";
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

  const tiles: { href: string; title: string; icon: typeof ShoppingCart; text: string; stat: string; right?: string }[] = [
    { href: "/personal/groceries", title: "Groceries", icon: ShoppingCart, text: "Scan receipts, track item prices and monthly spending", stat: stats?.grocery ? `${formatCurrency(stats.grocery.total, stats.grocery.currency)} this month · ${stats.grocery.count} receipt${stats.grocery.count !== 1 ? "s" : ""}` : "Nothing this month yet" },
    { href: "/personal/projects", title: "Home Projects", icon: Hammer, text: "Scan tickets and see what each project costs", stat: stats ? `${stats.projects.count} active · ${formatCurrency(stats.projects.spent, "USD")} spent` : "" },
    { href: "/personal/travel", title: "Personal Travel", icon: Plane, text: "Scan receipts and get a trip total and summary", stat: stats ? `${stats.trips.count} active · ${formatCurrency(stats.trips.spent, "USD")} spent` : "" },
    ...(perms.has("documents")
      ? [{ href: "/documents", title: "Documents", icon: FolderOpen, text: "Passport, visas and trip documents, with renewal reminders", stat: stats?.documents != null ? `${stats.documents} document${stats.documents !== 1 ? "s" : ""}` : "" }]
      : []),
    ...(perms.has("loyalty")
      ? [{ href: "/personal/loyalty", title: "Loyalty cards", icon: CreditCard, text: "Store cards on your phone, ready to scan at the till", stat: stats?.cards != null ? `${stats.cards} card${stats.cards !== 1 ? "s" : ""}` : "", right: sharedCards != null && sharedCards > 0 ? `${sharedCards} shared` : "" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader title="Personal" description={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Only you can see this. It is kept separate from business trips and reports.</span>} />
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group block">
            <Card className="h-full rounded-xl p-5 transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><t.icon className="h-5 w-5" /></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{t.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium">
                <p>{t.stat || "\u00a0"}</p>
                {t.right ? <p className="text-primary" data-testid="tile-shared">{t.right}</p> : null}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
