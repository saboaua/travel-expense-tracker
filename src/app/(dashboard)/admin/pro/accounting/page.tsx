"use client";

import { Crown } from "lucide-react";
import { ProSubHeader } from "@/components/admin/ProSubHeader";
import { Card, CardContent } from "@/components/ui/card";
import { PROGRAMS } from "@/lib/accounting";

/** Accounting export is a Pro tool: it follows the Pro switch of each person, so there is nothing to set here except to see the formats. */
export default function ProAccountingPage() {
  return (
    <div className="space-y-5 p-4 md:p-8">
      <ProSubHeader active="accounting" title="Accounting export" description="Journal entries for the accountant, part of Pro" />
      <Card><CardContent className="space-y-1 p-4 text-sm">
        <p className="flex items-center gap-2 font-bold"><Crown className="h-4 w-4 text-amber-600" aria-hidden="true" />Pro only</p>
        <p className="text-muted-foreground">People with Pro (and admins) see Export to accounting on trips, projects and the reports page. Free accounts see it locked with a link to Pro. To give or end it, change their Pro under People and access.</p>
      </CardContent></Card>
      <p className="px-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Formats</p>
      <Card><CardContent className="divide-y p-0" data-testid="accounting-formats">
        {PROGRAMS.map((p) => (
          <div key={p.id} className="px-4 py-3"><p className="text-[15px] font-bold">{p.name}</p><p className="text-[12.5px] text-muted-foreground">{p.sub}</p></div>
        ))}
      </CardContent></Card>
    </div>
  );
}
