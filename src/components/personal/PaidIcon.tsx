import { Store } from "lucide-react";
import { paidLabel, type PaidWith } from "@/lib/paid-with";

/** The store a receipt is from, as a small tile. Same for every receipt, so the list reads as places. */
export function StoreTile() {
  return (
    <span aria-hidden="true" className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Store className="h-5 w-5" />
    </span>
  );
}

/** How a receipt was paid, as a small grey tag in words (Credit card, Debit card, Cash). Nothing when it was not set. */
export function PaidTag({ paid }: { paid: PaidWith | null | undefined }) {
  if (!paid) return null;
  return (
    <span data-testid={`paid-tag-${paid}`} className="mt-1 inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
      {paidLabel(paid)}
    </span>
  );
}
