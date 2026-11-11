"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, MapPin, Plane, Users } from "lucide-react";
import type { SharedFlight, SharedTrip } from "@/lib/sharing";
import { FlightCalendarSheet } from "@/components/flights/FlightCalendarSheet";
import { clock, flightSummary, sortFlights, statusView } from "@/lib/flights";
import { logShareView } from "@/lib/share-view";
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
  const [flights, setFlights] = useState<SharedFlight[]>([]);
  const [cal, setCal] = useState<SharedFlight | null>(null);
  const [added, setAdded] = useState("");
  const live = !!overview && overview.available && overview.enabled;

  useEffect(() => {
    if (!live) { setTrips([]); setFlights([]); return; }
    let alive = true;
    if (kind === "trip") {
      fetch("/api/sharing/flights", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { flights: [] }))
        .then((d: { flights?: SharedFlight[] }) => { if (alive) setFlights(Array.isArray(d.flights) ? d.flights : []); })
        .catch(() => { if (alive) setFlights([]); });
    }
    fetch("/api/sharing/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { trips: [] }))
      .then((d: { trips?: SharedTrip[] }) => { if (!alive) return; const list = Array.isArray(d.trips) ? d.trips.filter((t) => t.kind === kind) : []; list.forEach((t) => logShareView(t.kind, t.trip_id)); setTrips(list); })
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
            {flights.filter((f) => f.trip_id === t.trip_id).length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-2" aria-label="Flights" data-testid="shared-flights">
                {sortFlights(flights.filter((f) => f.trip_id === t.trip_id)).map((f) => {
                  const v = statusView(f);
                  return (
                    <li key={f.flight_id} className="flex items-center gap-2" data-testid="shared-flight">
                      <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate">{flightSummary(f)}</span>
                        <span className="block text-xs text-muted-foreground">{clock(f.dep_local) ? new Date(`${f.dep_local!.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""} · {v.label}</span>
                      </span>
                      <button type="button" data-testid="shared-flight-calendar" onClick={() => setCal(f)} aria-label={`Add ${f.flight_number} to calendar`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <CalendarPlus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">View only</p>
          </li>
        ))}
      </ul>
      {added && <p role="status" className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{added}</p>}
      {cal && <FlightCalendarSheet flight={{ ...cal, id: cal.flight_id }} onClose={() => setCal(null)} onAdded={setAdded} />}
    </section>
  );
}
