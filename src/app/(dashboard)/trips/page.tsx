import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Plane, MapPin, CalendarDays, ChevronRight, Check } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

type Expense = { amount: number; amount_usd?: number | null; currency?: string | null };
type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  expenses?: Expense[];
};

function tripTotal(trip: Trip) {
  return (
    trip.expenses?.reduce((sum, e) => {
      if (e.amount_usd != null) return sum + Number(e.amount_usd);
      if (!e.currency || e.currency === "USD") return sum + Number(e.amount);
      return sum;
    }, 0) || 0
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      {title}
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
        {count}
      </span>
    </h2>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const completed = trip.status === "completed";
  const count = trip.expenses?.length || 0;

  return (
    <Link href={`/trips/${trip.id}`} className="group block">
      <div className="h-full rounded-2xl border bg-card p-5 shadow-sm transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">{trip.name}</h3>
          {completed ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Check className="h-3 w-3" />
              Completed
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {trip.destination && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{trip.destination}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {formatDate(trip.start_date)}
            {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between border-t pt-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(tripTotal(trip), "USD")}</p>
            <p className="text-xs text-muted-foreground">
              {count} expense{count !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("trips")
    .select("*, expenses(amount, amount_usd, currency)")
    .eq("user_id", user?.id)
    .order("start_date", { ascending: false });

  const trips = (data || []) as Trip[];
  const active = trips.filter((t) => t.status === "active");
  const completed = trips.filter((t) => t.status === "completed");

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Trips</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your business travels and track expenses</p>
        </div>
        <Link href="/trips/new">
          <Button className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            New Trip
          </Button>
        </Link>
      </div>

      {trips.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-16 text-center">
            <Plane className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No trips yet</p>
            <Link href="/trips/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create your first trip
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-10">
          {active.length > 0 && (
            <section className="space-y-4">
              <SectionHeading title="Active" count={active.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section className="space-y-4">
              <SectionHeading title="Completed" count={completed.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
