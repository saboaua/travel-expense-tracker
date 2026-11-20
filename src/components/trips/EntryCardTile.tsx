import Link from "next/link";
import { Bell, Check, ChevronRight, FileText } from "lucide-react";
import type { EntryStatus } from "@/lib/entry-card";

const TONE = {
  red: { box: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", icon: Bell },
  amber: { box: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", icon: FileText },
  green: { box: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", icon: Check },
} as const;

/** The Aruba re-entry card on a trip that ends with a flight home: green when done, amber while there is time, red from 2 days before the flight. */
export function EntryCardTile({ tripId, status, flightText }: { tripId: string; status: EntryStatus; flightText: string }) {
  const t = TONE[status.state];
  const Icon = t.icon;
  return (
    <section data-testid="entry-card-tile" data-state={status.state} className={`rounded-xl border p-4 shadow-sm ${t.box}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-background ${t.text}`}><Icon className="h-6 w-6" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-base font-bold ${t.text}`}>{status.title}</h2>
          <p className="text-sm text-muted-foreground">{status.sub}</p>
        </div>
        <span className={`shrink-0 rounded-full border bg-background px-2.5 py-0.5 text-xs font-bold ${t.text}`}>{status.label}</span>
      </div>
      {status.state !== "green" && (
        <ul className="mt-3 space-y-1 text-sm">
          {status.missing.length === 0 ? <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" aria-hidden /> Your details are saved</li> : <li className="flex items-start gap-2 text-red-700 dark:text-red-300">Missing: {status.missing.join(", ")}</li>}
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" aria-hidden /> {flightText}</li>
        </ul>
      )}
      <Link href={`/trips/${tripId}/entry-card`} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {status.state === "green" ? "See my card answers" : "Get my card answers"} <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
