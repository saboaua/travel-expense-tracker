"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useBusinessLogo } from "@/lib/use-business-logo";

/** The switch that adds your logo and company name to a report, with a small preview of the top of the page. */
export function ReportLogoSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { company, url, loading } = useBusinessLogo();
  const has = !!(url || company);
  return (
    <div className="space-y-3" data-testid="logo-switch">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center gap-3 text-left">
        <span className={cn("relative h-7 w-[46px] shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden="true">
          <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
        </span>
        <span><span className="block text-[14.5px] font-bold">Add my logo and company name</span><span className="block text-[12.5px] text-muted-foreground">From your profile</span></span>
      </button>
      {on && has && (
        <div className="rounded-xl border bg-card p-3 shadow-sm" data-testid="logo-preview">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && <img src={url} alt="" className="h-9 w-9 rounded-lg object-contain" />}
            <div className="min-w-0"><p className="truncate text-xs font-extrabold">{company || "Your company"}</p><p className="text-[10.5px] text-muted-foreground">The report name goes here</p></div>
          </div>
          <div className="my-2 h-px bg-border" />
          {[0, 1, 2].map((i) => <div key={i} className="my-1.5 flex gap-1.5"><span className="h-1.5 w-[28%] rounded bg-muted" /><span className="h-1.5 flex-1 rounded bg-muted/60" /><span className="h-1.5 w-[18%] rounded bg-muted" /></div>)}
        </div>
      )}
      {on && !has && !loading && (
        <p className="text-[13px] leading-snug text-muted-foreground" data-testid="logo-missing">No logo yet? <Link href="/profile" className="font-bold text-primary underline-offset-2 hover:underline">Add your logo in Profile</Link>. Without one, the report shows only your company name.</p>
      )}
    </div>
  );
}
