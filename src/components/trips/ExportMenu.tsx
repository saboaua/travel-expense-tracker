"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ChevronDown, Crown, Download, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { featureLocked } from "@/lib/limits";
import { useLimits } from "@/lib/use-limits";
import { todayISO } from "@/lib/utils";

/** "Export" with its two choices, so the trip's action row stays short: Add expense, Edit, Export. */
export function ExportMenu({ tripId, className }: { tripId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const lim = useLimits();
  const locked = !!lim && featureLocked(lim.limits, lim.who, "trip_reports", todayISO());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const item = "flex min-h-11 items-center gap-2.5 px-3 text-sm hover:bg-accent";
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={className}>
        <Download className="h-4 w-4" aria-hidden="true" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border bg-raised py-1 shadow-lg">
          <a role="menuitem" href={`/api/export/trip/${tripId}/zip?images=1`} className={item} onClick={() => setOpen(false)} data-testid="export-images">
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>Images only<span className="block text-xs text-muted-foreground">ZIP with every receipt photo</span></span>
          </a>
          {locked ? (
            <>
              <Link role="menuitem" href="/personal/pro" className={item} onClick={() => setOpen(false)} data-testid="export-excel-pro">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">Excel report<span className="block text-xs text-muted-foreground">Totals, categories, every expense</span></span>
                <Crown className="h-4 w-4 text-amber-600" aria-hidden="true" />
              </Link>
              <Link role="menuitem" href="/personal/pro" className={item} onClick={() => setOpen(false)}>
                <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">Report and images<span className="block text-xs text-muted-foreground">ZIP with the Excel and the photos</span></span>
                <Crown className="h-4 w-4 text-amber-600" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <a role="menuitem" href={`/api/export/trip/${tripId}/excel`} className={item} onClick={() => setOpen(false)} data-testid="export-excel">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>Excel report<span className="block text-xs text-muted-foreground">Totals, categories, every expense</span></span>
              </a>
              <a role="menuitem" href={`/api/export/trip/${tripId}/zip`} className={item} onClick={() => setOpen(false)}>
                <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>Report and images<span className="block text-xs text-muted-foreground">ZIP with the Excel and the photos</span></span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
