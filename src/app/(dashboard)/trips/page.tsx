import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/session";
import { Card, CardContent } from "@/components/ui/card";
import { TripsList } from "@/components/trips/TripsList";
import type { ListTrip } from "@/lib/trips-list";
import { Button } from "@/components/ui/button";
import { Plus, Plane } from "lucide-react";
import { todayISO } from "@/lib/utils";
import { BusinessTabs } from "@/components/layout/BusinessTabs";

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

export default async function TripsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  // Failsafe: the middleware already sends signed-out visitors away; if one ever got here, never run a query without an owner
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("trips")
    .select("id, name, destination, start_date, end_date, status, expenses(amount, amount_usd, currency)")
    .eq("user_id", user?.id)
    .order("start_date", { ascending: false });

  const trips = (data || []) as Trip[];
  const listTrips: ListTrip[] = trips.map((t) => ({
    id: t.id,
    name: t.name,
    destination: t.destination,
    start_date: t.start_date,
    end_date: t.end_date,
    status: t.status,
    total: tripTotal(t),
    count: t.expenses?.length || 0,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <BusinessTabs />
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
        <TripsList trips={listTrips} today={todayISO()} />
      )}
    </div>
  );
}
