"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ShoppingCart, Hammer, Plane, ChevronRight, Lock, FolderOpen } from "lucide-react";
import { useAccess } from "@/lib/use-access";
import { summarizePersonal } from "@/lib/personal/summary";
import { formatCurrency, todayISO } from "@/lib/utils";

type Stats = ReturnType<typeof summarizePersonal> & { documents: number | null };

export default function PersonalHubPage() {
  const [enabled, setEnabled] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const { perms } = useAccess();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
      if (flag && flag.personal_enabled === false) return setEnabled(false);

      const monthStart = `${todayISO().slice(0, 7)}-01`;
      const [g, p, d] = await Promise.all([
        supabase.from("grocery_receipts").select("total, currency").gte("purchase_date", monthStart),
        supabase.from("personal_projects").select("kind, status, personal_expenses(amount_usd)").eq("status", "active"),
        supabase.from("travel_documents").select("id", { count: "exact", head: true }),
      ]);
      setStats({ ...summarizePersonal(g.data, p.data as never), documents: d.error ? null : d.count ?? 0 });
    })();
  }, []);

  if (!enabled) return <div className="p-8 text-sm text-muted-foreground">The Personal section is turned off by your administrator.</div>;

  const tiles = [
    { href: "/personal/groceries", title: "Groceries", icon: ShoppingCart, text: "Scan receipts, track item prices and monthly spending", stat: stats?.grocery ? `${formatCurrency(stats.grocery.total, stats.grocery.currency)} this month · ${stats.grocery.count} receipt${stats.grocery.count !== 1 ? "s" : ""}` : "Nothing this month yet" },
    { href: "/personal/projects", title: "Home Projects", icon: Hammer, text: "Scan tickets and see what each project costs", stat: stats ? `${stats.projects.count} active · ${formatCurrency(stats.projects.spent, "USD")} spent` : "" },
    { href: "/personal/travel", title: "Personal Travel", icon: Plane, text: "Scan receipts and get a trip total and summary", stat: stats ? `${stats.trips.count} active · ${formatCurrency(stats.trips.spent, "USD")} spent` : "" },
    ...(perms.has("documents")
      ? [{ href: "/documents", title: "Documents", icon: FolderOpen, text: "Passport, visas and trip documents, with renewal reminders", stat: stats?.documents != null ? `${stats.documents} document${stats.documents !== 1 ? "s" : ""}` : "" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="border-b pb-6">
        <h1 className="text-2xl font-bold md:text-3xl">Personal</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Only you can see this. It is kept separate from business trips and reports.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group block">
            <Card className="h-full rounded-2xl p-5 transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><t.icon className="h-5 w-5" /></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{t.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
              <p className="mt-4 text-sm font-medium">{t.stat || "\u00a0"}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
