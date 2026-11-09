"use client";

import { useEffect, useState } from "react";
import { ScanBarcode, Users } from "lucide-react";
import { CardFace } from "@/components/loyalty/CardFace";
import { logShareView } from "@/lib/share-view";
import { CardDetail } from "@/components/loyalty/CardDetail";
import type { BarcodeFormat, LoyaltyCard } from "@/lib/loyalty";
import type { SharedCard } from "@/lib/sharing";
import { useSharing } from "@/lib/use-sharing";

const asCard = (c: SharedCard): LoyaltyCard => ({
  id: c.card_id,
  user_id: "",
  store_name: c.store_name,
  holder_name: c.holder_name,
  category: c.category,
  card_number: c.card_number,
  barcode_format: c.barcode_format as BarcodeFormat,
  color: c.color,
  image_path: null,
  created_at: "",
});
const photoOf = (c: SharedCard) => (c.has_image ? `/api/sharing/photo/${c.card_id}` : null);

/** "Shared with you" under the wallet: cards partners chose to show you. View only, never cached for offline use. */
export function SharedCards() {
  const { overview } = useSharing();
  const [cards, setCards] = useState<SharedCard[]>([]);
  const [open, setOpen] = useState<SharedCard | null>(null);
  const live = !!overview && overview.available && overview.enabled;

  useEffect(() => {
    if (!live) return setCards([]);
    let alive = true;
    fetch("/api/sharing/loyalty", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d: { cards?: SharedCard[] }) => { if (alive) setCards(Array.isArray(d.cards) ? d.cards : []); })
      .catch(() => { if (alive) setCards([]); });
    return () => { alive = false; };
  }, [live, overview]);

  if (cards.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Shared with you" data-testid="shared-cards">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5" aria-hidden="true" /> Shared with you</h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.share_id} data-testid="shared-tile">
            <button type="button" onClick={() => { logShareView("loyalty_card", c.card_id); setOpen(c); }} aria-label={`Open ${c.store_name}, shared by ${c.shared_by}`} className="block w-full rounded-xl border-2 border-dashed border-primary/50 text-left shadow-sm transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <CardFace card={asCard(c)} photoUrl={photoOf(c)} className="h-28 rounded-[10px] sm:h-36">
                <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/30 backdrop-blur-sm" aria-hidden="true"><ScanBarcode className="h-4 w-4" /></span>
              </CardFace>
            </button>
            <p className="mt-1 truncate text-xs font-semibold text-primary">Shared by {c.shared_by}</p>
          </li>
        ))}
      </ul>
      {open && <CardDetail card={asCard(open)} onClose={() => setOpen(null)} shared={{ by: open.shared_by, photoUrl: photoOf(open) }} />}
    </section>
  );
}
