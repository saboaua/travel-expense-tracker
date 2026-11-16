"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Camera, ChevronRight, Hammer, MapPin, Plane } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import { TripWeather } from "@/components/TripWeather";
import { AdvisoryTile } from "@/components/AdvisoryTile";
import { BASE_CURRENCY, type DashboardProject, type DashboardRow } from "@/lib/personal/dashboard";
import { cn, daysBetween, formatCurrency } from "@/lib/utils";

const money = (n: number) => formatCurrency(n, BASE_CURRENCY);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const heading = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const seeAll = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const longDate = (d: string, withYear = true) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
function dateSpan(a: string | null, b: string | null) {
  if (a && b) return `${longDate(a, false)} – ${longDate(b)}`;
  if (a) return `From ${longDate(a)}`;
  return "No dates yet";
}
/** Where a trip stands today, for the badge on its card. */
function tripBadge(p: DashboardProject, today: string): { text: string; tone: "green" | "blue" | "grey" } {
  if (p.start_date && p.start_date > today) return { text: `Upcoming · ${plural(daysBetween(today, p.start_date), "day")} left`, tone: "green" };
  if (p.end_date && p.end_date < today) return { text: "Dates passed", tone: "grey" };
  if (p.start_date) {
    const day = daysBetween(p.start_date, today) + 1;
    return { text: p.end_date ? `Day ${day} of ${daysBetween(p.start_date, p.end_date) + 1}` : `Day ${day}`, tone: "blue" };
  }
  return { text: "In progress", tone: "blue" };
}

function spentOn(rows: DashboardRow[], id: string) {
  const mine = rows.filter((r) => r.projectId === id && r.awg != null);
  return { total: mine.reduce((s, r) => s + (r.awg as number), 0), count: mine.length };
}

/** Active trips (the person's own, with weather) and the travel advice for the first one with a destination. Nothing at all when there are no trips. */
export function ActiveTrips({ rows, projects, today }: { rows: DashboardRow[]; projects: DashboardProject[]; today: string }) {
  const trips = projects.filter((p) => (p.status || "active") === "active" && p.kind === "personal_trip");
  if (trips.length === 0) return null;
  const advised = trips.find((t) => t.destination && t.destination.trim());
  return (
    <>
      <section aria-labelledby="home-trips-h" data-testid="home-trips" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="home-trips-h" className={heading}>Active trips</h2>
          <Link href="/personal/travel" className={seeAll}>See all</Link>
        </div>
        {trips.map((t) => {
          const spent = spentOn(rows, t.id);
          const badge = tripBadge(t, today);
          return (
            <Fragment key={t.id}>
              <div data-testid="personal-trip-card" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Link href={`/personal/travel/${t.id}`} className="relative block h-40 bg-gradient-to-b from-sky-500 via-sky-300 to-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Open ${t.name}`}>
                  <Plane className="absolute right-4 top-12 h-16 w-16 text-white/30" aria-hidden="true" />
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900/10 via-transparent to-slate-900/75" />
                  <span className={cn("absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold text-white", badge.tone === "green" ? "bg-green-700" : badge.tone === "blue" ? "bg-blue-700" : "bg-slate-600")}>{badge.text}</span>
                  <div className="absolute inset-x-4 bottom-3.5 space-y-0.5 text-white">
                    {t.destination && <p className="flex items-center gap-1 text-[13px]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{t.destination}</p>}
                    <p className="truncate text-xl font-bold tracking-tight">{t.name}</p>
                    <p className="text-sm">{dateSpan(t.start_date, t.end_date)}</p>
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xl font-bold tabular-nums">{money(spent.total)}</p>
                    <p className="text-[13px] text-muted-foreground">spent · {plural(spent.count, "expense")}</p>
                  </div>
                  <Link href={`/personal/travel/${t.id}/expense`} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Add expense
                  </Link>
                </div>
              </div>
              {t.start_date && <TripWeather destination={t.destination ?? null} start={t.start_date} end={t.end_date ?? null} today={today} editHref={`/personal/travel/${t.id}/edit`} />}
            </Fragment>
          );
        })}
      </section>
      {advised && <div data-testid="home-advice"><AdvisoryTile tripId={advised.id} destination={advised.destination as string} /></div>}
    </>
  );
}

/** Active projects with what each has cost so far. Nothing at all when there are none. */
export function HomeProjects({ rows, projects }: { rows: DashboardRow[]; projects: DashboardProject[] }) {
  const list = projects.filter((p) => (p.status || "active") === "active" && p.kind === "home_project");
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="home-projects-h" data-testid="home-projects" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-projects-h" className={heading}>Projects</h2>
        <Link href="/personal/projects" className={seeAll}>See all</Link>
      </div>
      {list.map((p) => {
        const spent = spentOn(rows, p.id);
        return (
          <Link key={p.id} href={`/personal/projects/${p.id}`} data-testid="personal-project-row" className="flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <IconTile tone="projects" className="h-11 w-11"><Hammer className="h-5 w-5" /></IconTile>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{p.name}</span>
              <span className="block text-[13px] text-muted-foreground">{spent.count ? plural(spent.count, "expense") : "No expenses yet"}</span>
            </span>
            <span className="text-[15px] font-semibold tabular-nums">{money(spent.total)}</span>
            <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
