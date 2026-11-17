"use client";

import { Camera, ChevronRight, ScrollText, X } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";

/** The arrow next to Scan: one photo, or a long receipt in parts. Bottom sheet on phones, a centred panel on larger screens. */
export function ScanModeSheet({ onScan, onLong, onClose }: { onScan: () => void; onLong: () => void; onClose: () => void }) {
  const row = "flex min-h-[60px] w-full items-center gap-3 rounded-xl border-2 p-2.5 pr-3 text-left transition-colors hover:bg-muted active:border-primary active:bg-primary/5";
  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="How do you want to scan?" data-testid="scan-mode-sheet" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-4 pb-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">How do you want to scan?</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2">
          <button type="button" data-testid="scan-mode-one" onClick={onScan} className={`${row} border-border`}>
            <IconTile tone="projects" className="h-10 w-10"><Camera className="h-5 w-5" /></IconTile>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Scan a receipt</span><span className="block text-xs text-muted-foreground">One photo of the receipt</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          <button type="button" data-testid="scan-mode-long" onClick={onLong} className={`${row} border-border`}>
            <IconTile tone="documents" className="h-10 w-10"><ScrollText className="h-5 w-5" /></IconTile>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Long receipt</span><span className="block text-xs text-muted-foreground">Take it in parts. We join them for you.</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Your photo is saved as one image either way</p>
      </div>
    </div>
  );
}
