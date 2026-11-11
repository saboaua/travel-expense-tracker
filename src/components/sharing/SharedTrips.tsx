"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Clock, MapPin, Users } from "lucide-react";
import type { SharedFlight, SharedTrip } from "@/lib/sharing";
import { FlightCalendarSheet } from "@/components/flights/FlightCalendarSheet";
import { DestinationPhoto } from "@/components/DestinationPhoto";
import { StatusChip } from "@/components/flights/FlightPanel";
import { clock, shownDeparture, sortFlights } from "@/lib/flights";
import { BADGE_CLASS, legTag, limitFlights, moreFlightsLabel, tripBadge } from "@/lib/trip-card";
import { todayISO } from "@/lib/utils";
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
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [cal, setCal] = useState<SharedFlight | null>(null);
  const [added, setAdded] = useState("");
  const live = !!overview && overview.available && overview.enabled;

  useEffect(() => {
    if (!live) { setTrips([]); setFlights([]); setPhotos({}); return; }
    let alive = true;
    if (kind === "trip") {
      fetch("/api/sharing/flights", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { flights: [] }))
        .then((d: { flights?: SharedFlight[] }) => { if (alive) setFlights(Array.isArray(d.flights) ? d.flights : []); })
        .catch(() => { if (alive) setFlights([]); });
    }
    fetch("/api/sharing/trip-photos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { photos: {} }))
      .then((d: { photos?: Record<string, string | null> }) => { if (alive) setPhotos(d.photos && typeof d.photos === "object" ? d.photos : {}); })
      .catch(() => { if (alive) setPhotos({}); });
    fetch("/api/sharing/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { trips: [] }))
      .then((d: { trips?: SharedTrip[] }) => { if (!alive) return; const list = Array.isArray(d.trips) ? d.trips.filter((t) => t.kind === kind) : []; list.forEach((t) => logShareView(t.kind, t.trip_id)); setTrips(list); })
      .catch(() => { if (alive) setTrips([]); });
    return () => { alive = false; };
  }, [live, overview, kind]);

  if (trips.length === 0) return null;
  const today = todayISO();
  const when = (f: SharedFlight) => {
    const day = (shownDeparture(f) || f.flight_date || "").slice(0, 10);
    const c = clock(shownDeparture(f));
    const d = day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
    return [d, c ? `${c.time} ${c.period}` : ""].filter(Boolean).join(" \u00b7 ");
  };
  return (
    <section className="space-y-3" aria-label="Shared with you" data-testid="shared-trips">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5" aria-hidden="true" /> Shared with you</h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {trips.map((t) => {
          const badge = tripBadge(t.start_date, t.end_date, today);
          const mine = kind === "trip" ? sortFlights(flights.filter((f) => f.trip_id === t.trip_id)) : [];
          const { shown, more } = limitFlights(mine, 2);
          return (
            <li key={t.share_id} data-testid="shared-trip" className="overflow-hidden rounded-2xl border-2 border-dashed border-primary/50 bg-card shadow-sm sm:flex">
              <div className="relative h-24 shrink-0 bg-gradient-to-br from-slate-800 to-slate-600 sm:h-auto sm:min-h-[8.5rem] sm:w-[220px]">
                {photos[t.trip_id] && <DestinationPhoto src={photos[t.trip_id]!} />}
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
                {badge && (
                  <span data-testid="shared-badge" className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow ${BADGE_CLASS[badge.tone]}`}>
                    <Clock className="h-3 w-3" aria-hidden="true" />{badge.label}
                  </span>
                )}
                {t.destination && (
                  <p className="absolute bottom-2.5 left-3 right-3 flex items-center gap-1 text-sm text-white">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{t.destination}</span>
                  </p>
                )}
              </div>
              <div className="min-w-0 flex-1 p-3.5">
                <p className="text-xs font-semibold text-primary">Shared by {t.shared_by} &middot; View only</p>
                <p className="mt-0.5 truncate text-base font-semibold">{t.name}</p>
                {(t.start_date || t.end_date) && <p className="text-sm text-muted-foreground">{rangeLabel(t.start_date, t.end_date)}</p>}
                {shown.length > 0 && (
                  <ul className="mt-2.5 space-y-2 border-t pt-2.5" aria-label="Flights" data-testid="shared-flights">
                    {shown.map((f) => (
                      <li key={f.flight_id} className="flex items-center gap-2" data-testid="shared-flight">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="font-bold tracking-wide text-foreground/80">{legTag(f.leg)}</span>
                            <span>{when(f)}</span>
                          </p>
                          <p className="truncate text-sm font-semibold">{f.dep_iata ?? "?"} to {f.arr_iata ?? "?"} <span className="font-normal text-muted-foreground">&middot; {f.flight_number}</span></p>
                          <StatusChip flight={f} />
                        </div>
                        <button type="button" data-testid="shared-flight-calendar" onClick={() => setCal(f)} aria-label={`Add ${f.flight_number} to calendar`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <CalendarPlus className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                    {more > 0 && <li className="text-xs font-semibold text-primary" data-testid="shared-flights-more">{moreFlightsLabel(more)}</li>}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {added && <p role="status" className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{added}</p>}
      {cal && <FlightCalendarSheet flight={{ ...cal, id: cal.flight_id }} onClose={() => setCal(null)} onAdded={setAdded} />}
    </section>
  );
}
