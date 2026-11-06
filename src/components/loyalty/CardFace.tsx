"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { cardColor, type LoyaltyCard } from "@/lib/loyalty";
import { LOYALTY_BUCKET } from "@/lib/loyalty-image";

/** A short-lived link to a private card photo (null while loading or when there is no photo). */
export function useCardPhoto(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    createClient().storage.from(LOYALTY_BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setState({ path, url: data.signedUrl });
    });
    return () => { cancelled = true; };
  }, [path]);
  return path && state?.path === path ? state.url : null;
}

/** Only the design of the card: the saved front photo, or a colour block with the name and type. Never a barcode. */
export function CardFace({ card, side = "front", className, children }: { card: LoyaltyCard; side?: "front" | "back"; className?: string; children?: React.ReactNode }) {
  const path = side === "back" ? card.back_image_path : card.image_path;
  const url = useCardPhoto(path);
  return (
    <div className={cn("relative overflow-hidden text-white", className)} style={{ background: cardColor(card) }} data-face={url ? "photo" : "color"}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${card.store_name} card ${side}`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center">
          <p className="line-clamp-2 break-words px-6 text-[15px] font-bold leading-tight sm:text-xl">{card.store_name}</p>
          {card.category && <p className="mt-1 text-[10px] uppercase tracking-[0.08em] opacity-90 sm:mt-1.5 sm:text-xs">{card.category}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
