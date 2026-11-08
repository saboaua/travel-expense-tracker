"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, Download, FileSpreadsheet } from "lucide-react";

/** "Export" with its two choices, so the trip's action row stays short: Add expense, Edit, Export. */
export function ExportMenu({ tripId, className }: { tripId: string; className?: string }) {
  const [open, setOpen] = useState(false);
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
          <a role="menuitem" href={`/api/export/trip/${tripId}/excel`} className={item} onClick={() => setOpen(false)}>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Excel
          </a>
          <a role="menuitem" href={`/api/export/trip/${tripId}/zip`} className={item} onClick={() => setOpen(false)}>
            <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>ZIP<span className="block text-xs text-muted-foreground">Excel plus all receipt images</span></span>
          </a>
        </div>
      )}
    </div>
  );
}
