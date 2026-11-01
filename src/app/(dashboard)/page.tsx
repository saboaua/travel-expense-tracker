import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, Receipt, TrendingUp, MapPin } from "lucide-react";
import { formatCurrency, formatDate, todayISO, daysBetween } from "@/lib/utils";
import { getDestinationInfo } from "@/lib/destination";

type Expense = { amount: number; amount_usd?: number | null; currency?: string | null };

function usdOf(e: Expense) {
  if (e.amount_usd != null) return Number(e.amount_usd);
  if (!e.currency || e.currency === "USD") return Number(e.amount);
  return 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single();

  const { data: trips } = await supabase
    .from("trips")
    .select("*, expenses(amount, amount_usd, currency)")
    .eq("user_id", user?.id)
    .order("start_date", { ascending: true });

  const { data: allExpenses } = await supabase
    .from("expenses")
    .select("amount, amount_usd, currency")
    .eq("user_id", user?.id);

  const totalSpent = allExpenses?.reduce((sum, e) => sum + usdOf(e), 0) || 0;
  const today = todayISO();
  const endOf = (t: { start_date: string; end_date: string | null }) => t.end_date || t.start_date;
  const byStart = (x: { start_date: string }, y: { start_date: string }) => x.start_date.localeCompare(y.start_date);

  const activeAll = (trips || []).filter((t) => t.status === "active");
  const completedTripsList = (trips || [])
    .filter((t) => t.status === "completed")
    .sort((x, y) => y.start_date.localeCompare(x.start_date));
  const activeCount = activeAll.length;

  // Order: in progress now, then upcoming (soonest first), then trips that ended but are still open.
  const ongoing = activeAll.filter((t) => t.start_date <= today && endOf(t) >= today).sort(byStart);
  const upcoming = activeAll.filter((t) => t.start_date > today).sort(byStart);
  const ended = activeAll.filter((t) => endOf(t) < today).sort((x, y) => byStart(y, x));
  const activeTripsList = [...ongoing, ...upcoming, ...ended];

  // Featured = in progress, else the soonest upcoming, else the latest trip that has passed
  // but is still active (receipts can keep coming in until it is marked completed)
  const featured = ongoing[0] || upcoming[0] || ended[0] || null;
  const otherActive = activeTripsList.filter((t) => t.id !== featured?.id);
  const destinationInfo = featured ? await getDestinationInfo(featured.destination) : null;

  const tripState = (t: { start_date: string; end_date: string | null }) => {
    if (t.start_date > today) {
      const d = daysBetween(today, t.start_date);
      return { label: d === 1 ? "Upcoming \u00b7 tomorrow" : `Upcoming \u00b7 in ${d} days`, cls: "bg-blue-100 text-blue-700" };
    }
    if (endOf(t) >= today) return { label: "In progress", cls: "bg-green-100 text-green-700" };
    return { label: "Trip passed \u00b7 still active", cls: "bg-slate-100 text-slate-700" };
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Track your business travel expenses</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Plane className="h-4 w-4" />
              Active Trips
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Total in USD
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalSpent, "USD")}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              This Year
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalSpent, "USD")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Trips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Trips</CardTitle>
            <CardDescription>Stays here until you mark the trip completed</CardDescription>
          </div>
          <Link href="/trips">
            <Button variant="outline" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTripsList.length === 0 ? (
            <div className="text-center py-8">
              <Plane className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No active trips</p>
            </div>
          ) : (
            <>
              {featured && (
                <Link href={`/trips/${featured.id}`} className="block group">
                  <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="relative h-44 md:h-56 bg-gradient-to-br from-slate-900 to-slate-700">
                      {destinationInfo?.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={destinationInfo.imageUrl}
                          alt={featured.destination || featured.name}
                          className="absolute inset-0 h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/65" />
                      <div className="absolute inset-0 flex flex-col justify-end p-4 text-white">
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            {featured.destination && (
                              <p className="text-sm flex items-center gap-1 opacity-90">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{featured.destination}</span>
                              </p>
                            )}
                            <h3 className="text-xl font-semibold mt-0.5 truncate">{featured.name}</h3>
                            <p className="text-sm opacity-90">
                              {formatDate(featured.start_date)}
                              {featured.end_date && ` \u2013 ${formatDate(featured.end_date)}`}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tripState(featured).cls}`}>
                            {tripState(featured).label}
                          </span>
                        </div>
                      </div>
                    </div>
                    {(destinationInfo?.summary || featured.category) && (
                      <div className="p-4 space-y-2">
                        {featured.category && (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {featured.category}
                          </span>
                        )}
                        {destinationInfo?.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {destinationInfo.summary}
                            <span className="text-xs opacity-70"> (Wikipedia)</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              )}

              {otherActive.map((trip) => {
                const tripTotal =
                  trip.expenses?.reduce((sum: number, e: Expense) => sum + usdOf(e), 0) || 0;
                return (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      {trip.destination && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {trip.destination}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {formatDate(trip.start_date)}
                        {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(tripTotal, "USD")}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tripState(trip).cls}`}>
                        {tripState(trip).label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>

      {/* Completed Trips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Completed Trips</CardTitle>
            <CardDescription>Past business travels and archived expenses</CardDescription>
          </div>
          <Link href="/trips">
            <Button variant="outline" size="sm">View archive</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {completedTripsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No completed trips yet</p>
          ) : (
            <div className="space-y-3">
              {completedTripsList.map((trip) => {
                const tripTotal =
                  trip.expenses?.reduce((sum: number, e: Expense) => sum + usdOf(e), 0) || 0;
                return (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      {trip.destination && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {trip.destination}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {formatDate(trip.start_date)}
                        {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(tripTotal, "USD")}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        completed
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
