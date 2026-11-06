"use client";

import { useEffect, useState } from "react";
import { FlipHorizontal, Pencil, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayNumber, formatLabel, type LoyaltyCard } from "@/lib/loyalty";
import { CardFace } from "./CardFace";
import { Barcode } from "./Barcode";

/** Checkout view: the card on the top third (flip to its back), a big high-contrast barcode and the number below. Escape or Done closes it. */
export function CardDetail({ card, onClose, onEdit }: { card: LoyaltyCard; onClose: () => void; onEdit: () => void }) {
  const [side, setSide] = useState<"front" | "back">("front");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // keep the screen on while the code is being scanned (not every browser can)
    let lock: { release: () => Promise<void> } | null = null;
    const wake = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wake?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lock?.release().catch(() => {});
    };
  }, [onClose]);

  const isQr = card.barcode_format === "QR";
  return (
    <div className="app-frame fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${card.store_name} card`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full max-h-[46rem] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl">
        <CardFace card={card} side={side} className="h-1/3 min-h-[9rem] shrink-0 rounded-none">
          <Button type="button" variant="outline" size="icon" className="absolute right-2 top-2 h-11 w-11 border-0 bg-black/35 text-white hover:bg-black/50 hover:text-white" onClick={onClose} aria-label="Close" autoFocus><X className="h-5 w-5" /></Button>
          {card.back_image_path && (
            <button type="button" onClick={() => setSide(side === "front" ? "back" : "front")} className="absolute bottom-2 right-2 flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/60">
              <FlipHorizontal className="h-4 w-4" aria-hidden="true" /> {side === "front" ? "Show back" : "Show front"}
            </button>
          )}
        </CardFace>

        <div className="flex min-h-0 flex-[2] flex-col gap-3 overflow-y-auto p-4">
          <div className="rounded-xl border bg-white p-4 pb-3 text-black">
            <Barcode value={card.card_number} format={card.barcode_format} label={`Barcode for ${displayNumber(card.card_number)}`} className={isQr ? "mx-auto block h-56 w-56 max-w-full" : "block h-32 w-full"} />
            <p className="mt-3 break-all text-center text-xl font-semibold tabular-nums tracking-[0.12em]" data-testid="card-number">{displayNumber(card.card_number)}</p>
            <p className="mt-1 text-center text-xs text-slate-500">{[formatLabel(card.barcode_format), card.holder_name].filter(Boolean).join(" · ")}</p>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <p>Turn your screen brightness up so the scanner can read the code. We keep the screen awake while this is open.</p>
          </div>

          <div className="mt-auto flex gap-2.5">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button type="button" className="h-11 flex-1" onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
