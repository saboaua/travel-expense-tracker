"use client";

import { useEffect, useState } from "react";
import { Pencil, Sun, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cardColor, displayNumber, formatLabel, type LoyaltyCard } from "@/lib/loyalty";
import { LOYALTY_BUCKET } from "@/lib/loyalty-image";
import { Barcode } from "./Barcode";

/** Checkout view: a big, high-contrast barcode, with the card photo one tap away. Escape or Done closes it. */
export function CardDetail({ card, onClose, onEdit }: { card: LoyaltyCard; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<"barcode" | "image">("barcode");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!card.image_path) return;
    let cancelled = false;
    createClient().storage.from(LOYALTY_BUCKET).createSignedUrl(card.image_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setImageUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [card.image_path]);

  const isQr = card.barcode_format === "QR";
  const tabBtn = (active: boolean) => cn("h-10 rounded-lg text-sm transition-colors", active ? "bg-background font-semibold shadow-sm" : "font-medium text-muted-foreground hover:text-foreground");

  return (
    <div className="app-frame fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${card.store_name} card`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-card p-4 text-card-foreground shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{card.store_name}</h2>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cardColor(card) }} aria-hidden="true" />
              <span className="truncate">{[card.category, card.holder_name].filter(Boolean).join(" · ") || "Loyalty card"}</span>
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="Close" autoFocus><X className="h-5 w-5" /></Button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "barcode"} className={tabBtn(tab === "barcode")} onClick={() => setTab("barcode")}>Barcode</button>
          <button type="button" role="tab" aria-selected={tab === "image"} disabled={!card.image_path} className={cn(tabBtn(tab === "image"), "disabled:opacity-40")} onClick={() => setTab("image")}>Card image</button>
        </div>

        {tab === "barcode" ? (
          <div className="rounded-xl border bg-white p-4 pb-3 text-black">
            <Barcode value={card.card_number} format={card.barcode_format} label={`Barcode for ${displayNumber(card.card_number)}`} className={isQr ? "mx-auto block h-64 w-64 max-w-full" : "block h-36 w-full"} />
            <p className="mt-3 break-all text-center text-xl font-semibold tabular-nums tracking-[0.12em]" data-testid="card-number">{displayNumber(card.card_number)}</p>
            <p className="mt-1 text-center text-xs text-slate-500">{formatLabel(card.barcode_format)}</p>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={`${card.store_name} card`} className="max-h-[60vh] w-full object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground">Loading the photo…</p>
            )}
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <p>Turn your screen brightness up so the scanner can read the code. We keep the screen awake while this is open.</p>
        </div>

        <div className="flex gap-2.5">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
          <Button type="button" className="h-11 flex-1" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
