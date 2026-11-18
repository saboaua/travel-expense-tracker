import Link from "next/link";
import { Money } from "@/components/ui/money";
import { BedDouble, Camera, ChevronRight, Clock, MapPin, Navigation, Plane, Plus, RefreshCw, Ticket, ListChecks, Copy, Check } from "lucide-react";
import { DestinationPhoto } from "@/components/DestinationPhoto";
import { StatusChip } from "@/components/flights/FlightPanel";
import { formatDate } from "@/lib/utils";
import { BADGE_CLASS, type TripBadge } from "@/lib/trip-card";
import { directionsUrl, type Hotel } from "@/lib/hotel";
import { paperSub, type TripPaper } from "@/lib/trip-papers";
import type { CardChecklist } from "@/lib/trip-checklist";
import { clock, durationMinutes, durationText, shownArrival, shownDeparture, type TripFlight } from "@/lib/flights";

type Trip = { id: string; name: string; destination: string | null; start_date: string; end_date: string | null };

const shortDate = (day: string) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const time = (local: string | null) => {
  const c = clock(local);
  return c ? `${c.time} ${c.period}` : "--:--";
};
const dates = (t: Trip) => `${formatDate(t.start_date)}${t.end_date ? ` – ${formatDate(t.end_date)}` : ""}`;

/** Airline badge, big airport codes with local times, duration pill. Desktop only; the phone gets the compact block. */
function FlightStrip({ f }: { f: TripFlight }) {
  const dur = durationText(durationMinutes(f));
  const code = f.flight_number.split(" ")[0];
  const meta = [f.aircraft, shortDate(f.flight_date)].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border bg-muted/30 p-3.5" data-testid="featured-flight">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-900 text-xs font-bold text-white" aria-hidden="true">{code.slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{[f.airline, f.flight_number].filter(Boolean).join(" · ")}</p>
          {meta && <p className="truncate text-[13px] text-muted-foreground">{meta}</p>}
        </div>
        <StatusChip flight={f} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold leading-none tracking-tight">{f.dep_iata ?? "—"}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{time(shownDeparture(f))}</p>
          <p className="text-[13px] text-muted-foreground">{f.dep_city ?? f.dep_name ?? ""}</p>
        </div>
        <div className="min-w-10 flex-1 text-center">
          {dur && <span className="inline-block whitespace-nowrap rounded-full bg-background px-2.5 py-0.5 text-[13px] text-muted-foreground ring-1 ring-border">{dur} {"·"} Nonstop</span>}
          <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full border-2 border-slate-400" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <Plane className="h-[18px] w-[18px] shrink-0 text-primary" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-primary" />
          </div>
          {f.cabin && <p className="mt-1.5 text-[13px] text-muted-foreground">{f.flight_number} {"·"} {f.cabin}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold leading-none tracking-tight">{f.arr_iata ?? "—"}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{time(shownArrival(f))}</p>
          <p className="text-[13px] text-muted-foreground">{f.arr_city ?? f.arr_name ?? ""}</p>
        </div>
      </div>
    </div>
  );
}

/** Phone: the whole flight is one tappable block that opens the flight details. */
function CompactFlight({ f, href, more }: { f: TripFlight; href: string; more: number }) {
  const dur = durationText(durationMinutes(f));
  return (
    <Link href={href} data-testid="featured-flight-compact" aria-label={`Flight details for ${f.flight_number}`} className="flex min-h-14 items-center gap-2 rounded-xl border bg-muted/30 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-[11px] font-bold text-white" aria-hidden="true">{f.flight_number.slice(0, 2)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.flight_number}{f.airline ? ` · ${f.airline}` : ""}</span>
          <StatusChip flight={f} />
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          <span>{f.dep_iata ?? "?"} {time(shownDeparture(f))}</span>
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-hidden="true">{"—"} {dur ?? ""} <Plane className="h-3.5 w-3.5 text-primary" /> {"—"}</span>
          <span>{f.arr_iata ?? "?"} {time(shownArrival(f))}</span>
        </p>
        {more > 0 && <p className="text-xs text-muted-foreground">+{more} more flight{more === 1 ? "" : "s"}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** The hotel under the flight: same panel, a bed icon, the name, and a Directions button that opens the maps app. */
function HotelStrip({ hotel }: { hotel: Hotel }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 md:px-[18px] md:py-3.5" data-testid="featured-hotel">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-900 text-white md:h-9 md:w-9" aria-hidden="true"><BedDouble className="h-[18px] w-[18px]" /></span>
        <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-tight">{hotel.name}</p>
        <a
          href={directionsUrl(hotel)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions to ${hotel.name}`}
          data-testid="featured-hotel-directions"
          className="-my-1.5 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
        >
          <Navigation className="h-4 w-4" aria-hidden="true" /> Directions
        </a>
      </div>
      {hotel.address && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{hotel.address}</span>
        </p>
      )}
    </div>
  );
}

/** Transfers, tickets and booking details kept with the trip: the two added last, and a way to the rest. Shown under Add expense. */
function PapersStrip({ tripId, count, latest }: { tripId: string; count: number; latest: TripPaper[] }) {
  const base = `/trips/${tripId}/papers`;
  const dashed = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-400 px-3 text-sm font-bold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (count === 0) return (
    <div className="border-t pt-3" data-testid="trip-papers">
      <Link href={`${base}/new`} className={`${dashed} min-h-[52px] justify-start`} data-testid="trip-papers-add"><Ticket className="h-5 w-5" aria-hidden="true" /><span className="flex-1">Add transfer, tickets, booking</span><Plus className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
  );
  return (
    <div className="border-t pt-3" data-testid="trip-papers">
      <div className="flex items-baseline justify-between"><h4 className="text-[15px] font-extrabold">Trip papers <span className="font-bold text-muted-foreground" data-testid="trip-papers-count">{count}</span></h4><span className="text-[13px] font-bold text-muted-foreground">Only you</span></div>
      <ul className="mt-1 divide-y">
        {latest.map((p) => (
          <li key={p.id}>
            <Link href={`${base}?open=${p.id}`} data-testid="trip-paper" className="flex min-h-14 items-center gap-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" aria-hidden="true"><Ticket className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{p.title}</span>{paperSub(p) && <span className="block truncate text-[12.5px] text-muted-foreground">{paperSub(p)}</span>}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {count > latest.length
        ? <Link href={base} className={`${dashed} mt-1.5 border-solid border-slate-300 bg-card`} data-testid="trip-papers-all">See all {count} papers<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        : <Link href={`${base}/new`} className={`${dashed} mt-1.5`} data-testid="trip-papers-add"><Plus className="h-4 w-4" aria-hidden="true" />Add paper</Link>}
    </div>
  );
}

/** The trip the dashboard features: photo, dates, the next flight and what has been spent. */
/** The private to-do and packing list of the trip, under Trip papers: progress and what is next, or a way to start one (or copy one from the same place). */
function ChecklistStrip({ tripId, data }: { tripId: string; data: CardChecklist }) {
  const base = `/trips/${tripId}/checklist`;
  const dashed = "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-400 px-3 text-sm font-bold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (data.total === 0 && data.suggestion) return (
    <div className="border-t pt-3" data-testid="trip-checklist">
      <div className="flex items-baseline justify-between"><h4 className="text-[15px] font-extrabold">Checklist</h4><span className="text-[13px] font-bold text-muted-foreground">Only you</span></div>
      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 p-3 text-sm leading-snug text-green-950 dark:border-green-900 dark:bg-green-950 dark:text-green-100" data-testid="trip-checklist-suggest"><Copy className="h-5 w-5 shrink-0 text-green-700" aria-hidden="true" /><span><b>You have a {data.suggestion.place} list.</b> Copy its {data.suggestion.count} thing{data.suggestion.count === 1 ? "" : "s"}?</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <Link href={`${base}?copy=1`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="trip-checklist-copy"><Copy className="h-4 w-4" aria-hidden="true" />Copy it</Link>
        <Link href={base} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="trip-checklist-empty"><Plus className="h-4 w-4" aria-hidden="true" />Start empty</Link>
      </div>
    </div>
  );
  if (data.total === 0) return (
    <div className="border-t pt-3" data-testid="trip-checklist">
      <Link href={base} className={`${dashed} min-h-[52px] justify-start`} data-testid="trip-checklist-start"><ListChecks className="h-5 w-5" aria-hidden="true" /><span className="flex-1">Make a checklist for this trip</span><Plus className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
  );
  const all = data.done === data.total;
  return (
    <div className="border-t pt-3" data-testid="trip-checklist">
      <div className="flex items-baseline justify-between"><h4 className="text-[15px] font-extrabold">Checklist <span className="font-bold text-muted-foreground" data-testid="trip-checklist-count">{data.done} of {data.total}</span></h4><span className="text-[13px] font-bold text-muted-foreground">Only you</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label="Checklist progress"><div className={`h-2 ${all ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.round((100 * data.done) / data.total)}%` }} /></div>
      {all ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300" data-testid="trip-checklist-ready"><Check className="h-4 w-4" aria-hidden="true" />Everything is ready for the trip</p>
      ) : (
        <ul className="mt-1 divide-y">
          {data.next.map((i) => (
            <li key={i.id}><Link href={base} data-testid="trip-checklist-item" className="flex min-h-12 items-center gap-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="h-[26px] w-[26px] shrink-0 rounded-lg border-2 border-slate-400" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{i.title}</span></Link></li>
          ))}
        </ul>
      )}
      <Link href={base} className={`${dashed} mt-1.5 border-solid border-slate-300 bg-card`} data-testid="trip-checklist-open">Open checklist<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
  );
}

export function FeaturedTripCard({ trip, imageUrl, badge, flight, moreFlights, hotel = null, papers = null, checklist = null, total, count }: {
  trip: Trip;
  imageUrl: string | null;
  badge: TripBadge;
  flight: TripFlight | null;
  moreFlights: number;
  hotel?: Hotel | null;
  papers?: { count: number; latest: TripPaper[] } | null;
  checklist?: CardChecklist | null;
  total: number;
  count: number;
}) {
  const flightsHref = `/trips/${trip.id}#flights`;
  return (
    <div data-testid="featured-trip" className="overflow-hidden rounded-2xl border bg-card shadow-sm md:flex">
      <Link href={`/trips/${trip.id}`} className="relative block h-[116px] bg-gradient-to-br from-slate-800 to-slate-600 md:h-auto md:min-h-[17rem] md:w-2/5 md:shrink-0">
        {imageUrl && <DestinationPhoto src={imageUrl} />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/75" />
        <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow ${BADGE_CLASS[badge.tone]}`}>
          <Clock className="h-3 w-3" aria-hidden="true" />
          {badge.label}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white md:hidden">
          <h3 className="truncate text-lg font-semibold leading-tight">{trip.name}</h3>
          <p className="text-[13px] opacity-90">{dates(trip)}</p>
        </div>
        {trip.destination && (
          <p className="absolute bottom-3 left-4 hidden items-center gap-1 text-sm text-white md:flex">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{trip.destination}</span>
          </p>
        )}
      </Link>

      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5 md:gap-4 md:p-6">
        <div className="hidden min-w-0 md:block">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/trips/${trip.id}`} className="min-w-0"><h3 className="truncate text-xl font-semibold">{trip.name}</h3></Link>
            {flight && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground/80" data-testid="featured-sync">
                {flight.source === "auto" ? <><RefreshCw className="h-3 w-3" aria-hidden="true" />Flight sync active</> : "Added by hand"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{dates(trip)}</p>
        </div>

        {flight && (
          <>
            <div className="hidden md:block"><FlightStrip f={flight} /></div>
            <div className="md:hidden"><CompactFlight f={flight} href={flightsHref} more={moreFlights} /></div>
          </>
        )}

        {hotel && <HotelStrip hotel={hotel} />}

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xl font-bold tabular-nums"><Money amount={total} currency="USD" /></p>
            <p className="text-sm text-muted-foreground">spent &middot; {count} expense{count !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {flight && (
              <Link href={flightsHref} data-testid="featured-flight-details" className="hidden h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:inline-flex">
                Flight details
              </Link>
            )}
            <Link href={`/trips/${trip.id}/add-expense`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              <Camera className="h-4 w-4" aria-hidden="true" />
              Add expense
            </Link>
          </div>
        </div>

        {papers && <PapersStrip tripId={trip.id} count={papers.count} latest={papers.latest} />}
        {checklist && <ChecklistStrip tripId={trip.id} data={checklist} />}
      </div>
    </div>
  );
}
