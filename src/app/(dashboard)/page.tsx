import { FlightLine } from "@/components/flights/FlightLine";
import { flightLine, type TripFlight } from "@/lib/flights";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, MapPin, Clock, Camera, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate, formatDateRange, todayISO, daysBetween } from "@/lib/utils";
import { DashboardHeader } from "@/components/DashboardHeader";
import { buildScanOptions } from "@/lib/scan-destination";
import { getDestinationInfo } from "@/lib/destination";
import { DestinationPhoto } from "@/components/DestinationPhoto";
import { WeatherCard } from "@/components/WeatherCard";
import { AdvisoryTile } from "@/components/AdvisoryTile";
import { PassportBalloon } from "@/components/documents/PassportBalloon";
import { currentPassport, docScope, documentStatus, kindLabel, maskNumber, numberLabel, renewalAlert, showsOn, sortForTiles, tileCountdown } from "@/lib/documents";
import { DocumentTiles, type DocTile } from "@/components/documents/DocumentTiles";
import { buildAccessNotification, buildNotifications, buildSecurityNotifications } from "@/lib/notifications";
import { buildSharingNotifications, type SharingOverview } from "@/lib/sharing";
import { permissionsFromRoles, type RoleRecord } from "@/lib/access";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/session";
import { PersonalTiles } from "@/components/PersonalTiles";
import { summarizePersonal } from "@/lib/personal/summary";
import { DashboardViews } from "@/components/DashboardViews";
import { buildRows, type DashboardProject, type DashboardRow } from "@/lib/personal/dashboard";
import { FLIGHT_COLS, DOCUMENT_TILE_COLS, DOCUMENT_TILE_COLS_BASE, DOCUMENT_TILE_COLS_NUMBER, PROFILE_HOME_COLS, PROFILE_HOME_PLACE_COLS, PERSONAL_PROJECT_COLS, withColumnFallback, withColumnFallback3 } from "@/lib/columns";

type Expense = { amount: number; amount_usd?: number | null; currency?: string | null; expense_date?: string | null };

function usdOf(e: Expense) {
  if (e.amount_usd != null) return Number(e.amount_usd);
  if (!e.currency || e.currency === "USD") return Number(e.amount);
  return 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  // Failsafe: the middleware already sends signed-out visitors away; if one ever got here, never run a query without an owner
  if (!user) redirect("/login");
  const uid = user?.id;

  // Wave 1: everything that only needs to know who is signed in, asked together
  const [profileRes, tripsRes, docRes, flagRes, rolesRes, flightsRes] = await Promise.all([
    withColumnFallback(
      (cols) => supabase.from("profiles").select(cols).eq("id", uid).single(),
      PROFILE_HOME_PLACE_COLS,
      PROFILE_HOME_COLS
    ),
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status, expenses(amount, amount_usd, currency)")
      .eq("user_id", uid)
      .order("start_date", { ascending: true }),
    // Passport renewal reminder (works before the documents migration is run: the query just returns nothing)
    withColumnFallback3(
      (cols) => supabase.from("travel_documents").select(cols).eq("user_id", uid),
      DOCUMENT_TILE_COLS,
      DOCUMENT_TILE_COLS_NUMBER,
      DOCUMENT_TILE_COLS_BASE
    ),
    supabase.from("app_settings").select("personal_enabled").eq("id", 1).single(),
    supabase.from("roles").select("key, label, permissions, known_features"),
    // Flights on the trips (a database without the flights table just gives none)
    supabase.from("trip_flights").select(FLIGHT_COLS).eq("user_id", uid),
  ]);
  const flightsByTrip = new Map<string, TripFlight[]>();
  for (const f of (flightsRes.data ?? []) as unknown as TripFlight[]) flightsByTrip.set(f.trip_id, [...(flightsByTrip.get(f.trip_id) ?? []), f]);
  const lineFor = (tripId: string) => flightLine(flightsByTrip.get(tripId) ?? [], Date.now());
  const profile = profileRes.data as unknown as { first_name: string | null; last_name: string | null; full_name: string | null; avatar_url: string | null; role: string | null; home_country?: string | null; home_city?: string | null } | null;
  const trips = tripsRes.data;
  type DocRow = { id: string; kind: string; title: string; issuing_country: string | null; expiry_date: string | null; trip_id: string | null; file_path: string | null; created_at: string; document_number?: string | null; show_on?: string | null };
  const docRows = (docRes.data || []) as unknown as DocRow[];
  const role = (profile?.role as string) || "user";
  const roleRows = rolesRes.error ? null : ((rolesRes.data || []) as RoleRecord[]);
  const myPerms = permissionsFromRoles(role, roleRows);
  const personalAllowed = !(flagRes.data && flagRes.data.personal_enabled === false);

  const passportAlert = renewalAlert(currentPassport(docRows.filter((d) => d.kind === "passport")), trips || [], todayISO());
  const docCounts: Record<string, number> = {};
  for (const d of docRows) if (d.trip_id) docCounts[d.trip_id] = (docCounts[d.trip_id] || 0) + 1;

  // Which trip the hero shows (decides which destination photo to look up)
  const todayStr = todayISO();
  const endOfTrip = (t: { start_date: string; end_date: string | null }) => t.end_date || t.start_date;
  const openTrips = (trips || []).filter((t) => t.status === "active");
  const featuredTrip =
    openTrips.filter((t) => t.start_date <= todayStr && endOfTrip(t) >= todayStr).sort((x, y) => x.start_date.localeCompare(y.start_date))[0] ||
    openTrips.filter((t) => t.start_date > todayStr).sort((x, y) => x.start_date.localeCompare(y.start_date))[0] ||
    openTrips.filter((t) => endOfTrip(t) < todayStr).sort((x, y) => y.start_date.localeCompare(x.start_date))[0] ||
    null;

  // Wave 2: what depends on the role, the personal switch or the hero trip, all asked together
  const wantsSecurity = myPerms.has("security.view");
  const wantsSummary = myPerms.has("personal") && personalAllowed;
  const wantsDash = myPerms.has("personal.dashboard") && personalAllowed;
  const wantsSharing = myPerms.has("sharing");
  const monthStart = `${todayISO().slice(0, 7)}-01`;
  const [eventsRes, groceryRes, summaryProjectsRes, scanProjectsRes, dashEx, dashGr, dashGi, dashPj, dashCu, destinationInfo, sharingRes] = await Promise.all([
    // Security alerts are only for admins (the same people who can open Admin > Security)
    wantsSecurity
      ? supabase
          .from("security_events")
          .select("event_type, severity, created_at")
          .in("severity", ["warning", "critical"])
          .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(300)
      : null,
    // Personal tiles: only when the section is on and the role has it (tables may not exist before the personal migration)
    wantsSummary ? supabase.from("grocery_receipts").select("total, currency").eq("user_id", uid).gte("purchase_date", monthStart) : null,
    wantsSummary ? supabase.from("personal_projects").select("kind, status, personal_expenses(amount_usd)").eq("user_id", uid).eq("status", "active") : null,
    // Active home projects and personal trips: places a scanned receipt can go
    wantsSummary ? supabase.from("personal_projects").select(PERSONAL_PROJECT_COLS).eq("user_id", uid).eq("status", "active").order("created_at", { ascending: false }) : null,
    // Personal dashboard (analytics): the person's own personal expenses and grocery receipts, read under row-level security.
    wantsDash ? supabase.from("personal_expenses").select("project_id, merchant, amount, currency, amount_usd, category, expense_date").eq("user_id", uid).order("expense_date", { ascending: false }).limit(5000) : null,
    wantsDash ? supabase.from("grocery_receipts").select("id, store, purchase_date, total, currency").eq("user_id", uid).order("purchase_date", { ascending: false }).limit(5000) : null,
    // The lines of those receipts, so the dashboard can show where grocery money goes by category
    wantsDash ? supabase.from("grocery_items").select("receipt_id, category, line_total").eq("user_id", uid).limit(20000) : null,
    wantsDash ? supabase.from("personal_projects").select("id, name, kind, status, destination, start_date, end_date").eq("user_id", uid) : null,
    wantsDash ? supabase.from("currencies").select("code, usd_rate") : null,
    featuredTrip ? getDestinationInfo(featuredTrip.destination) : null,
    // Partner sharing: invites waiting for an answer show on the bell (only for roles that have the option)
    wantsSharing ? supabase.rpc("sharing_overview") : null,
  ]);

  const securityNotifications = eventsRes ? buildSecurityNotifications(eventsRes.data || [], Date.now()) : [];
  // Admin only: new app options nobody has reviewed yet
  const accessNotifications = role === "admin" ? buildAccessNotification(roleRows || []) : [];
  const sharingNotifications = sharingRes && !sharingRes.error ? buildSharingNotifications(sharingRes.data as SharingOverview) : [];
  const notifications = [
    ...securityNotifications,
    ...sharingNotifications,
    ...accessNotifications,
    ...buildNotifications({ passportAlert, trips: trips || [], docCounts, today: todayISO() }),
  ].sort((a, b) => ({ urgent: 0, warning: 1, info: 2 })[a.severity] - ({ urgent: 0, warning: 1, info: 2 })[b.severity]);

  let personalSummary: ReturnType<typeof summarizePersonal> | null = null;
  if (groceryRes && summaryProjectsRes && !groceryRes.error && !summaryProjectsRes.error) {
    personalSummary = summarizePersonal(groceryRes.data, summaryProjectsRes.data as never);
  }

  let scanProjects: { id: string; kind: string; name: string; destination: string | null; start_date: string | null; end_date: string | null; status: string | null }[] = [];
  const personalOn = wantsSummary;
  if (scanProjectsRes && !scanProjectsRes.error) scanProjects = (scanProjectsRes.data || []) as typeof scanProjects;

  let dashRows: DashboardRow[] | null = null;
  let dashProjects: DashboardProject[] = [];
  if (dashEx && dashGr && dashPj && !dashEx.error && !dashGr.error && !dashPj.error) {
    const rates: Record<string, number> = {};
    for (const c of dashCu?.data || []) if (c.usd_rate && Number(c.usd_rate) > 0) rates[String(c.code).toUpperCase()] = Number(c.usd_rate);
    dashRows = buildRows(dashEx.data, dashGr.data, rates, dashGi && !dashGi.error ? dashGi.data : null);
    dashProjects = (dashPj.data || []) as DashboardProject[];
  }

  const today = todayISO();
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

  const otherTrips = activeTripsList.filter((t) => t.id !== featured?.id);

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

  // Scan / Upload targets. Trips: in progress, then still-open past trips (receipts keep arriving), then upcoming
  const scanOptions = buildScanOptions({
    trips: [...ongoing, ...ended, ...upcoming].map((t) => ({ id: t.id, name: t.name, destination: t.destination, start_date: t.start_date, end_date: t.end_date, range: formatDateRange(t.start_date, t.end_date) })),
    projects: scanProjects,
    canTrips: myPerms.has("trips"),
    canPersonal: personalOn,
    canDocuments: myPerms.has("documents"),
  });

  // Tiles for the person's own documents (not tied to a trip), soonest to expire first. "Show on" decides which dashboard lists each one.
  const toTile = (d: DocRow): DocTile => {
    const st = documentStatus(d.kind, d.expiry_date, todayISO());
    return {
      id: d.id,
      kind: d.kind,
      kindLabel: kindLabel(d.kind),
      title: d.title,
      country: d.issuing_country,
      number: d.document_number ? maskNumber(d.document_number) : null,
      expiry: d.expiry_date,
      level: st.level,
      statusLabel: st.label,
      filePath: d.file_path,
      numberLabel: numberLabel(d.kind),
      countdown: tileCountdown(d.kind, d.expiry_date, todayISO()),
      scope: docScope(d),
    };
  };
  const ownDocs = sortForTiles(docRows.filter((d) => !d.trip_id));
  const accountDocs = ownDocs.filter((d) => showsOn(d, "business"));
  const docTiles: DocTile[] = accountDocs.slice(0, 4).map(toTile);
  const personalDocsAll = ownDocs.filter((d) => showsOn(d, "personal"));
  const personalDocTiles: DocTile[] = personalDocsAll.slice(0, 6).map(toTile);

  const businessView = (
    <>
      {/* The bell lists everything; only an expired or nearly-expired passport also gets a banner */}
      {passportAlert && passportAlert.level !== "renew" && <PassportBalloon alert={passportAlert} />}

      {/* Active Trips */}
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 max-md:px-0">
          <div className="min-w-0 space-y-1">
            <CardTitle>Active Trips</CardTitle>
            <CardDescription>Your ongoing and upcoming travels. Completed trips are in Trips.</CardDescription>
          </div>
          <Link href="/trips">
            <Button variant="outline" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-4 max-md:px-0">
          {activeTripsList.length === 0 ? (
            <div className="text-center py-8">
              <Plane className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No active trips</p>
            </div>
          ) : (
            <>
              {featured && (() => {
                const fTotal = featured.expenses?.reduce((sum: number, e: Expense) => sum + usdOf(e), 0) || 0;
                const fCount = featured.expenses?.length || 0;
                const badge = heroBadge(featured);
                return (
                  <div
                    data-testid="featured-trip"
                    className="overflow-hidden rounded-2xl border bg-card shadow-sm md:flex"
                  >
                    <Link href={`/trips/${featured.id}`} className="relative block h-44 bg-gradient-to-br from-slate-800 to-slate-600 md:h-auto md:min-h-[13rem] md:w-2/5 md:shrink-0">
                      {destinationInfo?.imageUrl && <DestinationPhoto src={destinationInfo.imageUrl} />}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />
                      <span
                        className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow ${badge.cls}`}
                      >
                        <Clock className="h-3 w-3" />
                        {badge.label}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 p-4 text-white md:hidden">
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
                      {featured.destination && (
                        <p className="absolute bottom-3 left-4 hidden items-center gap-1 text-sm text-white md:flex">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{featured.destination}</span>
                        </p>
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col justify-between gap-4 p-4 md:p-6">
                      <Link href={`/trips/${featured.id}`} className="hidden min-w-0 md:block">
                        <h3 className="truncate text-xl font-semibold">{featured.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(featured.start_date)}
                          {featured.end_date && ` \u2013 ${formatDate(featured.end_date)}`}
                        </p>
                      </Link>
                      {lineFor(featured.id) && <FlightLine flight={lineFor(featured.id)!} />}
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xl font-bold tabular-nums">{formatCurrency(fTotal, "USD")}</p>
                          <p className="text-sm text-muted-foreground">
                            spent &middot; {fCount} expense{fCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Link
                          href={`/trips/${featured.id}/add-expense`}
                          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          <Camera className="h-4 w-4" />
                          Add expense
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {otherTrips.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also coming up</p>
                  {otherTrips.map((trip) => {
                    const tripTotal = trip.expenses?.reduce((sum: number, e: Expense) => sum + usdOf(e), 0) || 0;
                    const sub = trip.start_date > today ? `in ${daysBetween(today, trip.start_date)} days` : isPassed(trip) ? "Passed" : "In progress";
                    return (
                      <Link
                        key={trip.id}
                        href={`/trips/${trip.id}`}
                        className="flex min-h-16 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{trip.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(trip.start_date)}
                            {trip.end_date && ` \u2013 ${formatDate(trip.end_date)}`} &middot; {sub}
                          </p>
                          {lineFor(trip.id) && <div className="mt-0.5"><FlightLine flight={lineFor(trip.id)!} /></div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-semibold tabular-nums">{formatCurrency(tripTotal, "USD")}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dutch travel advice for the trip the hero shows (needs a destination) */}
      {featured?.destination && <AdvisoryTile tripId={featured.id} destination={featured.destination} />}

      {/* Documents: one tile per saved document, soonest to expire first */}
      {myPerms.has("documents") && <DocumentTiles tiles={docTiles} total={accountDocs.length} />}

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
        scanOptions={scanOptions}
        home={profile?.home_country || profile?.home_city ? { country: profile?.home_country, city: profile?.home_city } : null}
        notifications={notifications}
        canUseTrips={myPerms.has("trips")}
        weather={<WeatherCard inline />}
        hasPersonalView={!!dashRows}
      />

      {dashRows ? (
        <DashboardViews
          rows={dashRows}
          projects={dashProjects}
          today={today}
          docs={personalDocTiles}
          docTotal={personalDocsAll.length}
          canDocuments={myPerms.has("documents")}
        >
          {businessView}
        </DashboardViews>
      ) : (
        businessView
      )}
    </div>
  );
}
