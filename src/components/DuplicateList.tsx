import Link from "next/link";
import type { DuplicateMatch } from "@/lib/offline-queue";
import { formatCurrency } from "@/lib/utils";

const REASON: Record<DuplicateMatch["reason"], string> = {
  same_photo: "Very similar photo",
  same_details: "Same shop, date and amount",
  both: "Same photo and details",
};

/** The receipts you already saved that look like the one being added. */
export function DuplicateList({ matches }: { matches: DuplicateMatch[] }) {
  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li key={m.id} className="rounded-lg border bg-background p-3 text-sm text-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.merchant || "Receipt"}</p>
              <p className="text-muted-foreground">
                {m.currency ? formatCurrency(m.amount, m.currency) : m.amount} · {m.expenseDate}
                {m.tripName ? ` · ${m.tripName}` : ""}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{REASON[m.reason]}</p>
            </div>
            <Link href={`/trips/${m.tripId}/expenses/${m.id}`} className="shrink-0 text-xs font-medium text-primary underline" target="_blank" rel="noreferrer">
              View
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
