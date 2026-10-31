import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Plane } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(amount)")
    .eq("user_id", user?.id)
    .order("start_date", { ascending: false });

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

      {!trips || trips.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => {
            const total =
              trip.expenses?.reduce(
                (sum: number, e: { amount: number }) => sum + Number(e.amount),
                0
              ) || 0;

            return (
              <Link key={trip.id} href={`/trips/${trip.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{trip.name}</CardTitle>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          trip.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {trip.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {formatDate(trip.start_date)}
                      {trip.end_date && ` – ${formatDate(trip.end_date)}`}
                    </p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(total, trip.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {trip.expenses?.length || 0} expense
                      {(trip.expenses?.length || 0) !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}