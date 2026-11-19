"use client";

import { Camera, ChevronRight, ScrollText } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { IconTile } from "@/components/ui/icon-tile";

/** The arrow next to Scan: one photo, or a long receipt in parts. Bottom sheet on phones, a centred panel on larger screens. */
export function ScanModeSheet({ onScan, onLong, onClose }: { onScan: () => void; onLong: () => void; onClose: () => void }) {
  const row = "flex min-h-[60px] w-full items-center gap-3 rounded-xl border-2 p-2.5 pr-3 text-left transition-colors hover:bg-muted active:border-primary active:bg-primary/5";
  return (
    <BottomSheet title="How do you want to scan?" onClose={onClose} testId="scan-mode-sheet">
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
    </BottomSheet>
  );
}
