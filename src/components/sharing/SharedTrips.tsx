"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
import type { SharedTrip } from "@/lib/sharing";
import { useSharing } from "@/lib/use-sharing";

const fmt = (d: string | null) => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
export const rangeLabel = (a: string | null, b: string | null) => (a && b && a !== b ? `${fmt(a)} to ${fmt(b)}` : fmt(a || b));

/** "Shared with you" on the trips pages: name, destination and dates only. No links, no expenses, nothing to open. */
export function SharedTrips({ kind }: { kind: "trip" | "personal_trip" }) {
  const { overview } = useSharing();
  const [trips, setTrips] = useState<SharedTrip[]>([]);
  const live = !!overview && overview.available && overview.enabled;

  useEffect(() => {
    if (!live) return setTrips([]);
    let alive = true;
    fetch("/api/sharing/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { trips: [] }))
      .then((d: { trips?: SharedTrip[] }) => { if (alive) setTrips(Array.isArray(d.trips) ? d.trips.filter((t) => t.kind === kind) : []); })
      .catch(() => { if (alive) setTrips([]); });
    return () => { alive = false; };
  }, [live, overview, kind]);

  if (trips.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Shared with you" data-testid="shared-trips">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5" aria-hidden="true" /> Shared with you</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => (
          <li key={t.share_id} data-testid="shared-trip" className="rounded-xl border-2 border-dashed border-primary/50 bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold text-primary">Shared by {t.shared_by}</p>
            <p className="mt-1 text-base font-semibold">{t.name}</p>
            {t.destination && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t.destination}</p>}
            {(t.start_date || t.end_date) && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {rangeLabel(t.start_date, t.end_date)}</p>}
            <p className="mt-2 text-xs text-muted-foreground">View only</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
