import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, Receipt, TrendingUp, MapPin, Clock } from "lucide-react";
import { formatCurrency, formatDate, formatDateRange, todayISO, daysBetween } from "@/lib/utils";
import { DashboardHeader, type HeaderTrip } from "@/components/DashboardHeader";
import { getDestinationInfo } from "@/lib/destination";
import { WeatherCard } from "@/components/WeatherCard";
import { AdvisoryTile } from "@/components/AdvisoryTile";
import { PassportBalloon } from "@/components/documents/PassportBalloon";
import { currentPassport, renewalAlert } from "@/lib/documents";
import { buildAccessNotification, buildNotifications, buildSecurityNotifications } from "@/lib/notifications";
import { loadPermissions } from "@/lib/access-server";
import { PersonalTiles } from "@/components/PersonalTiles";
import { summarizePersonal } from "@/lib/personal/summary";
import { DashboardViews } from "@/components/DashboardViews";
import { buildRows, tileSummary, type DashboardProject, type DashboardRow } from "@/lib/personal/dashboard";
import { PROFILE_HOME_COLS } from "@/lib/columns";

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
    .select(PROFILE_HOME_COLS)
    .eq("id", user?.id)
    .single();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, destination, start_date, end_date, status, expenses(amount, amount_usd, currency)")
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
  const myPerms = await loadPermissions(supabase, (profile?.role as string) || "user");
  if (myPerms.has("security.view")) {
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
  // Admin only: new app options nobody has reviewed yet
  let accessNotifications: ReturnType<typeof buildAccessNotification> = [];
  if ((profile?.role as string) === "admin") {
    const { data: roleRows } = await supabase.from("roles").select("key, label, known_features");
    accessNotifications = buildAccessNotification(roleRows || []);
  }
  const notifications = [
    ...securityNotifications,
    ...accessNotifications,
    ...buildNotifications({ passportAlert, trips: trips || [], docCounts, today: todayISO() }),
  ].sort((a, b) => ({ urgent: 0, warning: 1, info: 2 })[a.severity] - ({ urgent: 0, warning: 1, info: 2 })[b.severity]);

  // Personal tiles: only when the section is on and the role has it (tables may not exist before the personal migration)
  let personalSummary: ReturnType<typeof summarizePersonal> | null = null;
  if (myPerms.has("personal")) {
    const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
    if (!(flag && flag.personal_enabled === false)) {
      const monthStart = `${todayISO().slice(0, 7)}-01`;
      const [g, pr] = await Promise.all([
        supabase.from("grocery_receipts").select("total, currency").eq("user_id", user?.id).gte("purchase_date", monthStart),
        supabase.from("personal_projects").select("kind, status, personal_expenses(amount_usd)").eq("user_id", user?.id).eq("status", "active"),
      ]);
      if (!g.error && !pr.error) personalSummary = summarizePersonal(g.data, pr.data as never);
    }
  }

  // Personal dashboard (analytics): the person's own personal expenses and grocery receipts, read under row-level security.
  let dashRows: DashboardRow[] | null = null;
  let dashProjects: DashboardProject[] = [];
  if (myPerms.has("personal.dashboard")) {
    const { data: flag } = await supabase.from("app_settings").select("personal_enabled").eq("id", 1).single();
    if (!(flag && flag.personal_enabled === false)) {
      const [ex, gr, pj, cu] = await Promise.all([
        supabase.from("personal_expenses").select("project_id, merchant, amount, currency, amount_usd, category, expense_date").eq("user_id", user?.id).order("expense_date", { ascending: false }).limit(5000),
        supabase.from("grocery_receipts").select("store, purchase_date, total, currency").eq("user_id", user?.id).order("purchase_date", { ascending: false }).limit(5000),
        supabase.from("personal_projects").select("id, name, kind, status, start_date, end_date").eq("user_id", user?.id),
        supabase.from("currencies").select("code, usd_rate"),
      ]);
      if (!ex.error && !gr.error && !pj.error) {
        const rates: Record<string, number> = {};
        for (const c of cu.data || []) if (c.usd_rate && Number(c.usd_rate) > 0) rates[String(c.code).toUpperCase()] = Number(c.usd_rate);
        dashRows = buildRows(ex.data, gr.data, rates);
        dashProjects = (pj.data || []) as DashboardProject[];
      }
    }
  }

  const today = todayISO();
  const monthTotal =
    allExpenses?.filter((e) => (e.expense_date || "").startsWith(today.slice(0, 7))).reduce((sum, e) => sum + usdOf(e), 0) || 0;
  const yearTotal =
    allExpenses?.filter((e) => (e.expense_date || "").startsWith(today.slice(0, 4))).reduce((sum, e) => sum + usdOf(e), 0) || 0;
  const endOf = (t: { start_date: string; end_date: string | null }) => t.end_date || t.start_date;
  const byStart = (x: { start_date: string }, y: { start_date: string }) => x.start_date.localeCompare(y.start_date);

  const activeAll = (trips || []).filter((t) => t.status === "active");
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

  const businessView = (
    <>
      {/* The bell lists everything; only an expired or nearly-expired passport also gets a banner */}
      {passportAlert && passportAlert.level !== "renew" && <PassportBalloon alert={passportAlert} />}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
        <Card className="col-span-2 sm:col-span-1">
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
              This Month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold">{formatCurrency(monthTotal, "USD")}</p>
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
      </div>

      {/* Dutch travel advice for the trip the hero shows (needs a destination) */}
      {featured?.destination && <AdvisoryTile tripId={featured.id} destination={featured.destination} />}

      {/* Active Trips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Trips</CardTitle>
            <CardDescription>Your ongoing and upcoming travels. Completed trips are in Trips.</CardDescription>
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

      {/* Without the Personal dashboard option the tiles stay here, so nobody loses the links */}
      {!dashRows && personalSummary && <PersonalTiles summary={personalSummary} />}
    </>
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <DashboardHeader
        firstName={firstName}
        initials={initials}
        avatarUrl={profile?.avatar_url || null}
        activeCount={activeCount}
        trips={quickScanTrips}
        notifications={notifications}
        canUseTrips={myPerms.has("trips")}
      />

      {dashRows ? (
        <DashboardViews
          rows={dashRows}
          projects={dashProjects}
          today={today}
          shared={<WeatherCard />}
          personalTiles={myPerms.has("personal") ? <PersonalTiles summary={tileSummary(dashRows, dashProjects, today)} currency="AWG" /> : null}
        >
          {businessView}
        </DashboardViews>
      ) : (
        <>
          <WeatherCard />
          {businessView}
        </>
      )}
    </div>
  );
}
