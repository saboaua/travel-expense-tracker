import Link from "next/link";
import { ChevronRight, FileSpreadsheet, MapPin } from "lucide-react";
import { BackLink, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { HubCountryChips } from "@/components/admin/HubCountryChips";
import { SUPERMARKET_TOOLS } from "@/lib/admin-tools";
import { PAGE_WIDTH } from "@/components/layout/PageShell";

const ICONS = { doit: FileSpreadsheet, places: MapPin, community: FileSpreadsheet } as const;

export default function AdminSupermarketsPage() {
  return (
    <div className={`${PAGE_WIDTH.wide} space-y-5 p-4 md:p-8`}>
      <BackLink href="/admin/settings">Global Settings</BackLink>
      <PageHeader title="Supermarkets" description="Prices and places for the Price tracker and the Best store map" />
      <Card><CardContent className="divide-y p-0">
        {SUPERMARKET_TOOLS.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <Link key={t.id} href={t.href} className="flex min-h-[68px] items-center gap-3 px-4 py-3 hover:bg-accent" data-testid={`supermarkets-row-${t.id}`}>
              <IconTile tone={t.tone} className="h-11 w-11"><Icon className="h-6 w-6" /></IconTile>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold">{t.title}</span><span className="block text-[12.5px] text-muted-foreground">{t.sub}</span><HubCountryChips tool={t.id} /></span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })}
      </CardContent></Card>
    </div>
  );
}
