import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, Receipt, TrendingUp, MapPin, Clock } from "lucide-react";
import { formatCurrency, formatDate, formatDateRange, todayISO, daysBetween } from "@/lib/utils";
import { DashboardHeader, type HeaderTrip } from "@/components/DashboardHeader";
import { getDestinationInfo } from "@/lib/destination";
import { WeatherCard } from "@/components/WeatherCard";
import { PassportBalloon } from "@/components/documents/PassportBalloon";
import { currentPassport, renewalAlert } from "@/lib/documents";
import { buildNotifications, buildSecurityNotifications } from "@/lib/notifications";
import { canViewSecurity, type UserRole } from "@/lib/roles";

type Expense = { amount: number; amount_usd?: number | null; currency?: string | null; expense_date?: string | null };

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
    .select("amount, amount_usd, currency, expense_date")
    .eq("user_id", user?.id);

  // Passport renewal reminder (works before the documents migration is run: the query just returns nothing)
  const { data: docRows } = await supabase.from("travel_documents").select("kind, expiry_date, trip_id").eq("user_id", user?.id);
  const passportAlert = renewalAlert(currentPassport((docRows || []).filter((d) => d.kind === "passport")), trips || [], todayISO());
  const docCounts: Record<string, number> = {};
  for (const d of docRows || []) if (d.trip_id) docCounts[d.trip_id] = (docCounts[d.trip_id] || 0) + 1;
  // Security alerts are only for admins (the same people who can open Admin > Security)
  let securityNotifications: ReturnType<typeof buildSecurityNotifications> = [];
  if (canViewSecurity((profile?.role as UserRole) || "user")) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: events } = await supabase
      .from("security_events")
      .select("event_type, severity, created_at")
      .in("severity", ["warning", "critical"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    securityNotifications = buildSecurityNotifications(events || [], Date.now());
  }
  const notifications = [
    ...securityNotifications,
    ...buildNotifications({ passportAlert, trips: trips || [], docCounts, today: todayISO() }),
  ].sort((a, b) => ({ urgent: 0, warning: 1, info: 2 })[a.severity] - ({ urgent: 0, warning: 1, info: 2 })[b.severity]);

  const totalSpent = allExpenses?.reduce((sum, e) => sum + usdOf(e), 0) || 0;
  const today = todayISO();
  const yearTotal =
    allExpenses?.filter((e) => (e.expense_date || "").startsWith(today.slice(0, 4))).reduce((sum, e) => sum + usdOf(e), 0) || 0;
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
  const destinationInfo = featured ? await getDestinationInfo(featured.destination) : null;

  const isPassed = (t: { start_date: string; end_date: string | null }) => endOf(t) < today;

  // Badge on the hero photo
  const heroBadge = (t: { start_date: string; end_date: string | null }) => {
    if (t.start_date > today) {
      const d = daysBetween(today, t.start_date);
      return { label: `Upcoming \u00b7 ${d} day${d !== 1 ? "s" : ""} left`, cls: "bg-emerald-500 text-white" };
    }
    if (!isPassed(t)) return { label: "In progress", cls: "bg-blue-500 text-white" };
    return { label: "Passed", cls: "bg-amber-500 text-white" };
  };

  // Greeting identity: profile first name, else first word of the full name, else the email prefix
  const firstName =
    profile?.first_name || (profile?.full_name ? String(profile.full_name).split(" ")[0] : null) || user?.email?.split("@")[0] || null;
  const initials = (
    profile?.first_name && profile?.last_name
      ? `${profile.first_name[0]}${profile.last_name[0]}`
      : profile?.full_name
        ? String(profile.full_name).split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("")
        : (firstName || "?").slice(0, 2)
  ).toUpperCase();

  // Quick Scan target order: in progress, then still-open past trips (receipts keep arriving), then upcoming
  const quickScanTrips: HeaderTrip[] = [...ongoing, ...ended, ...upcoming].map((t) => ({
    id: t.id,
    name: t.name,
    destination: t.destination,
    range: formatDateRange(t.start_date, t.end_date),
  }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <DashboardHeader
        firstName={firstName}
        initials={initials}
        avatarUrl={profile?.avatar_url || null}
        activeCount={activeCount}
        trips={quickScanTrips}
        notifications={notifications}
      />

      {/* The bell lists everything; only an expired or nearly-expired passport also gets a banner */}
      {passportAlert && passportAlert.level !== "renew" && <PassportBalloon alert={passportAlert} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Plane className="h-4 w-4" />
              Active Trips
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold">{activeCount}</p>
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
            <p className="text-2xl sm:text-3xl font-bold">{formatCurrency(totalSpent, "USD")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              This Year
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold">{formatCurrency(yearTotal, "USD")}</p>
          </CardContent>
        </Card>
        <WeatherCard />
      </div>

      {/* Active Trips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Trips</CardTitle>
            <CardDescription>Your ongoing and upcoming travels</CardDescription>
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
                <Link href={`/trips/${featured.id}`} className="block">
                  <div className="relative h-40 overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 md:h-52">
                    {destinationInfo?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={destinationInfo.imageUrl}
                        alt={featured.destination || featured.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/70" />
                    <span
                      className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold shadow ${heroBadge(featured).cls}`}
                    >
                      <Clock className="h-3 w-3" />
                      {heroBadge(featured).label}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      {featured.destination && (
                        <p className="flex items-center gap-1 text-xs opacity-90">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{featured.destination}</span>
                        </p>
                      )}
                      <h3 className="mt-0.5 truncate text-xl font-semibold">{featured.name}</h3>
                      <p className="text-sm opacity-90">
                        {formatDate(featured.start_date)}
                        {featured.end_date && ` - ${formatDate(featured.end_date)}`}
                      </p>
                    </div>
                  </div>
                </Link>
              )}

              {activeTripsList.map((trip) => {
                const tripTotal =
                  trip.expenses?.reduce((sum: number, e: Expense) => sum + usdOf(e), 0) || 0;
                return (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{trip.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(trip.start_date)}
                        {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <p className="font-semibold">{formatCurrency(tripTotal, "USD")}</p>
                      <div className="flex justify-end gap-1.5">
                        {isPassed(trip) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <Clock className="h-3 w-3" />
                            Passed
                          </span>
                        )}
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          active
                        </span>
                      </div>
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
