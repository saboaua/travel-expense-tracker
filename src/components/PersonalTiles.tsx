import Link from "next/link";
import { ChevronRight, Hammer, Plane, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PersonalSummary } from "@/lib/personal/summary";

/** Personal spending at a glance, shown under the active trips on the dashboard. */
export function PersonalTiles({ summary }: { summary: PersonalSummary }) {
  const tiles = [
    {
      href: "/personal/groceries",
      label: "Groceries",
      icon: ShoppingCart,
      amount: formatCurrency(summary.grocery?.total ?? 0, summary.grocery?.currency ?? "USD"),
      sub: summary.grocery ? `This month · ${summary.grocery.count} receipt${summary.grocery.count !== 1 ? "s" : ""}` : "Nothing this month yet",
    },
    {
      href: "/personal/projects",
      label: "Home Projects",
      icon: Hammer,
      amount: formatCurrency(summary.projects.spent, "USD"),
      sub: `${summary.projects.count} active project${summary.projects.count !== 1 ? "s" : ""}`,
    },
    {
      href: "/personal/travel",
      label: "Personal Travel",
      icon: Plane,
      amount: formatCurrency(summary.trips.spent, "USD"),
      sub: `${summary.trips.count} active trip${summary.trips.count !== 1 ? "s" : ""}`,
    },
  ];

  return (
    <section aria-label="Personal" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Personal</h2>
        <Link href="/personal" className="text-sm font-medium text-primary hover:underline">Open Personal</Link>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group block focus-visible:outline-none">
            <Card className="h-full p-3 transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary sm:p-5">
              <div className="flex items-center justify-between">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:gap-2 sm:text-sm">
                  <t.icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                  <span className="sm:truncate">{t.label}</span>
                </span>
                <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
              </div>
              <p className="mt-2 truncate text-base font-bold min-[400px]:text-lg sm:text-3xl">{t.amount}</p>
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">{t.sub}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
