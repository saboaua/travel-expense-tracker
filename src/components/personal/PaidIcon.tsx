import { Banknote, CreditCard, Landmark, Receipt } from "lucide-react";
import { paidLabel, type PaidWith } from "@/lib/paid-with";

const LOOK = {
  credit: { Icon: CreditCard, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  debit: { Icon: Landmark, tone: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  cash: { Icon: Banknote, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
} as const;

/** How a receipt was paid, as a small tile: credit card, debit card or cash. Grey receipt when it was not set. */
export function PaidIcon({ paid }: { paid: PaidWith | null | undefined }) {
  const look = paid ? LOOK[paid] : null;
  const Icon = look?.Icon ?? Receipt;
  return (
    <span role="img" aria-label={paid ? `Paid with ${paidLabel(paid).toLowerCase()}` : "Payment not set"} data-testid={`paid-icon-${paid ?? "none"}`}
      className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${look?.tone ?? "bg-muted text-muted-foreground"}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}
