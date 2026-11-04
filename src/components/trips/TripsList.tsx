"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronRight, MapPin, Plane, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatDateRange } from "@/lib/utils";
import { groupCompletedByYear, matchesQuery, phaseLabel, sortActive, tripPhase, type ListTrip, type Phase } from "@/lib/trips-list";

type Tab = "active" | "completed" | "all";

const PHASE_STYLE: Record<Phase, { accent: string; chip: string }> = {
  ongoing: { accent: "bg-blue-500", chip: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300" },
  upcoming: { accent: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  ended: { accent: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  completed: { accent: "bg-slate-300 dark:bg-slate-600", chip: "border-border bg-muted text-muted-foreground" },
};

function TripCard({ trip, today }: { trip: ListTrip; today: string }) {
  const phase = tripPhase(trip, today);
  const style = PHASE_STYLE[phase];
  return (
    <Link href={`/trips/${trip.id}`} className="group block focus-visible:outline-none">
      <div className="relative h-full overflow-hidden rounded-xl border bg-card p-5 pl-6 shadow-sm transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <span className={cn("absolute inset-y-0 left-0 w-1.5", style.accent)} aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">{trip.name}</h3>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", style.chip)}>
            {phase === "completed" && <Check className="h-3 w-3" aria-hidden="true" />}
            {phaseLabel(trip, today)}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {trip.destination && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{trip.destination}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between border-t pt-4">
          <div>
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(trip.total, "USD")}</p>
            <p className="text-xs text-muted-foreground">
              {trip.count} expense{trip.count !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Grid({ trips, today }: { trips: ListTrip[]; today: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((t) => (
        <TripCard key={t.id} trip={t} today={today} />
      ))}
    </div>
  );
}

function Heading({ title, count, right }: { title: string; count: number; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span>
      </h2>
      {right && <span className="text-sm text-muted-foreground">{right}</span>}
    </div>
  );
}

export function TripsList({ trips, today }: { trips: ListTrip[]; today: string }) {
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => trips.filter((t) => matchesQuery(t, query)), [trips, query]);
  const active = useMemo(() => sortActive(filtered, today), [filtered, today]);
  const years = useMemo(() => groupCompletedByYear(filtered), [filtered]);
  const completedCount = years.reduce((n, y) => n + y.trips.length, 0);

  const allActive = trips.filter((t) => t.status !== "completed").length;
  const allCompleted = trips.length - allActive;
  const totalSpent = trips.reduce((s, t) => s + t.total, 0);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: allActive },
    { id: "completed", label: "Completed", count: allCompleted },
    { id: "all", label: "All", count: trips.length },
  ];

  const showActive = tab !== "completed";
  const showCompleted = tab !== "active";
  const nothing = (showActive ? active.length : 0) + (showCompleted ? completedCount : 0) === 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: String(allActive) },
          { label: "Completed", value: String(allCompleted) },
          { label: "Total spent", value: formatCurrency(totalSpent, "USD") },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 truncate text-lg font-bold sm:text-2xl">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Trip filter" className="inline-flex rounded-xl border bg-muted/50 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label} <span className="ml-1 text-xs opacity-70">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or destination"
            aria-label="Search trips"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {nothing && (
        <Card>
          <CardContent className="py-12 text-center">
            <Plane className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">
              {query
                ? `No trips match “${query}”.`
                : tab === "completed"
                  ? "No completed trips yet. Mark a trip as completed once its receipts are in."
                  : "No active trips."}
            </p>
          </CardContent>
        </Card>
      )}

      {showActive && active.length > 0 && (
        <section className="space-y-4">
          {tab === "all" && <Heading title="Active" count={active.length} />}
          <Grid trips={active} today={today} />
        </section>
      )}

      {showCompleted && years.length > 0 && (
        <div className="space-y-8">
          {years.map((y) => (
            <section key={y.year} className="space-y-4">
              <Heading title={tab === "completed" ? y.year : `Completed · ${y.year}`} count={y.trips.length} right={formatCurrency(y.total, "USD")} />
              <Grid trips={y.trips} today={today} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
