import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Plane, MapPin } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(amount, amount_usd, currency)")
    .eq("user_id", user?.id)
    .order("start_date", { ascending: false });

  const active = (trips || []).filter((t) => t.status === "active");
  const completed = (trips || []).filter((t) => t.status === "completed");

  function tripTotal(trip: any) {
    return trip.expenses?.reduce((sum: number, e: any) => {
      if (e.amount_usd != null) return sum + Number(e.amount_usd);
      if (!e.currency || e.currency === "USD") return sum + Number(e.amount);
      return sum;
    }, 0) || 0;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Trips</h1>
          <p className="text-muted-foreground mt-1">Manage your business travels</p>
        </div>
        <Link href="/trips/new">
          <Button className="w-full sm:w-auto gap-2">
            <Plus className="h-4 w-4" />
            New Trip
          </Button>
        </Link>
      </div>

      {(!trips || trips.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Plane className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No trips yet</p>
            <Link href="/trips/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create your first trip
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Active</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`}>
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{trip.name}</CardTitle>
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-green-100 text-green-700">
                            active
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {trip.destination && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                            <MapPin className="h-3 w-3" /> {trip.destination}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mb-3">
                          {formatDate(trip.start_date)}
                          {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
                        </p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(tripTotal(trip), "USD")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {trip.expenses?.length || 0} expense{(trip.expenses?.length || 0) !== 1 ? "s" : ""}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 mt-2">Completed</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`}>
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer opacity-90">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{trip.name}</CardTitle>
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-gray-100 text-gray-600">
                            completed
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {trip.destination && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                            <MapPin className="h-3 w-3" /> {trip.destination}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mb-3">
                          {formatDate(trip.start_date)}
                          {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
                        </p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(tripTotal(trip), "USD")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {trip.expenses?.length || 0} expense{(trip.expenses?.length || 0) !== 1 ? "s" : ""}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
