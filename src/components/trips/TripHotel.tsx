import Link from "next/link";
import { BedDouble, MapPin, Navigation, Pencil, Plus } from "lucide-react";
import { directionsUrl, type Hotel } from "@/lib/hotel";

/** The "Hotel" section of a trip: name, address and a Directions button, or a prompt to add one. */
export function TripHotel({ tripId, hotel }: { tripId: string; hotel: Hotel | null }) {
  if (!hotel) {
    return (
      <Link
        href={`/trips/${tripId}/edit#hotel`}
        className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-dashed bg-card p-4 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid="hotel-add"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BedDouble className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Add your hotel</span>
          <span className="block text-muted-foreground">Keep the name and address here, with directions one tap away.</span>
        </span>
        <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Hotel" data-testid="hotel-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BedDouble className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hotel</p>
          <h2 className="text-base font-bold leading-tight" data-testid="hotel-name">{hotel.name}</h2>
          {hotel.address && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span data-testid="hotel-address">{hotel.address}</span>
            </p>
          )}
        </div>
        <Link href={`/trips/${tripId}/edit#hotel`} aria-label="Edit hotel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <a
        href={directionsUrl(hotel)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        data-testid="hotel-directions"
      >
        <Navigation className="h-4 w-4" aria-hidden="true" /> Directions
      </a>
    </section>
  );
}
