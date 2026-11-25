"use client";

import { Globe, Store } from "lucide-react";
import { ONLINE_SITES, type OnlineSite } from "@/lib/personal/online-orders";

/** In a shop or online. Online asks for the site and when it arrives, and its prices are not shared with any country. */
export function BoughtOnline({ site, arrives, onSite, onArrives }: { site: OnlineSite | null; arrives: string; onSite: (s: OnlineSite | null) => void; onArrives: (d: string) => void }) {
  const online = site !== null;
  const seg = (on: boolean) => `flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "bg-background shadow-sm" : "text-muted-foreground"}`;
  return (
    <div data-testid="bought-online" className="space-y-3">
      <div className="text-sm font-medium">Where did you buy it?</div>
      <div role="radiogroup" aria-label="Where did you buy it?" className="flex gap-1 rounded-xl bg-muted p-1">
        <button type="button" role="radio" aria-checked={!online} className={seg(!online)} onClick={() => onSite(null)} data-testid="where-shop"><Store className="h-4 w-4" aria-hidden="true" />In a shop</button>
        <button type="button" role="radio" aria-checked={online} className={seg(online)} onClick={() => onSite(site ?? "amazon")} data-testid="where-online"><Globe className="h-4 w-4" aria-hidden="true" />Online</button>
      </div>
      {online && (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30" data-testid="online-fields">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Site">
            {ONLINE_SITES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={site === s.id} onClick={() => onSite(s.id)} data-testid={`site-${s.id}`}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${site === s.id ? "border-indigo-500 bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100" : "bg-background"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <label htmlFor="gr-arrives" className="text-sm font-medium">Arrives</label>
            <input id="gr-arrives" type="date" value={arrives} onChange={(e) => onArrives(e.target.value)} data-testid="arrives-on" className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
            <p className="text-xs text-muted-foreground">Optional. It shows under On its way until then. The date above is the day you ordered, not the delivery day.</p>
          </div>
          <p className="text-[13px] leading-relaxed text-indigo-900 dark:text-indigo-200" data-testid="online-note">Your budget counts this like any other. Online prices are never shared with a country&apos;s community.</p>
        </div>
      )}
    </div>
  );
}
