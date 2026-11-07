"use client";

import { useCachedPhoto } from "@/lib/use-cached-photo";
import { cn } from "@/lib/utils";
import { cardColor, type LoyaltyCard } from "@/lib/loyalty";
import { LOYALTY_BUCKET } from "@/lib/loyalty-image";

/** A link to a private card photo (null while loading or when there is no photo). Saved on the phone, so it also works offline. */
export function useCardPhoto(path: string | null | undefined): string | null {
  return useCachedPhoto(LOYALTY_BUCKET, path);
}

/** Only the design of the card: the saved front photo, or a colour block with the name and type. Never a barcode. */
export function CardFace({ card, side = "front", className, children, photoUrl }: { card: LoyaltyCard; side?: "front" | "back"; className?: string; children?: React.ReactNode; photoUrl?: string | null }) {
  // photoUrl is set for a card a partner shared: its photo comes from the sharing route, never from this person's storage
  const path = side === "back" ? card.back_image_path : card.image_path;
  const stored = useCardPhoto(photoUrl !== undefined ? null : path);
  const url = photoUrl !== undefined ? photoUrl : stored;
  return (
    <div className={cn("relative overflow-hidden text-white", className)} style={{ background: cardColor(card) }} data-face={url ? "photo" : "color"}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${card.store_name} card ${side}`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
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
