"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDown, ArrowUp, Camera, ChevronRight, Hammer, MapPin, Plane, Plus, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, daysBetween, formatCurrency } from "@/lib/utils";
import {
  BASE_CURRENCY,
  DEFAULT_FILTER,
  analyze,
  busiestDay,
  changePercent,
  filterRows,
  previousPeriod,
  resolveRange,
  trendSeries,
  type DashboardFilter,
  type DashboardProject,
  type DashboardRow,
  type Grain,
} from "@/lib/personal/dashboard";

// Different in lightness as well as hue, so the shares can be told apart without relying on colour alone.
const PALETTE = ["#1d4ed8", "#f59e0b", "#0d9488", "#7c3aed", "#e11d48", "#64748b"];
const money = (n: number) => formatCurrency(n, BASE_CURRENCY);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const RANGES: { id: DashboardFilter["range"]; label: string; text: string }[] = [
  { id: "30d", label: "30 days", text: "last 30 days" },
  { id: "90d", label: "90 days", text: "last 90 days" },
  { id: "year", label: "Year", text: "this year" },
  { id: "all", label: "All", text: "all time" },
];

function longDate(d: string, withYear = true) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
function shortDay(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
}
function dateSpan(a: string | null, b: string | null) {
  if (a && b) return `${longDate(a, false)} – ${longDate(b)}`;
  if (a) return `From ${longDate(a)}`;
  return "No dates yet";
}

/** Where a trip stands today, for the badge on its card. */
function tripBadge(p: DashboardProject, today: string): { text: string; tone: "green" | "blue" | "grey" } {
  if (p.start_date && p.start_date > today) {
    const n = daysBetween(today, p.start_date);
    return { text: `Upcoming · ${plural(n, "day")} left`, tone: "green" };
  }
  if (p.end_date && p.end_date < today) return { text: "Dates passed", tone: "grey" };
  if (p.start_date) {
    const day = daysBetween(p.start_date, today) + 1;
    return { text: p.end_date ? `Day ${day} of ${daysBetween(p.start_date, p.end_date) + 1}` : `Day ${day}`, tone: "blue" };
  }
  return { text: "In progress", tone: "blue" };
}

/** Ring chart of the category shares, with the total in the middle. The legend beside it is what filters the page. */
function Donut({ parts, total, caption }: { parts: { label: string; value: number; color: string }[]; total: number; caption: string }) {
  const R = 62;
  const STROKE = 14;
  const GAP = STROKE + 5; // round caps reach half a stroke past each end, so this leaves a clean 5-unit gap between slices
  const C = 2 * Math.PI * R;
  const sum = parts.reduce((t, x) => t + x.value, 0) || 1;
  let offset = 0;
  const label = `Share of spending: ${parts.map((x) => `${x.label} ${Math.round((x.value / sum) * 100)}%`).join(", ")}`;
  return (
    <div className="relative h-[210px] w-[210px] shrink-0 md:h-[240px] md:w-[240px]" data-testid="where-donut">
      <svg viewBox="0 0 160 160" className="h-full w-full" role="img" aria-label={label}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-muted/60" />
        {parts.map((x) => {
          const len = (x.value / sum) * C;
          const seg = (
            <circle key={x.label} cx="80" cy="80" r={R} fill="none" stroke={x.color} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={`${Math.max(len - GAP, 0.01)} ${C}`} strokeDashoffset={-(offset + GAP / 2)} transform="rotate(-90 80 80)" />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{caption}</span>
        <span className="mt-0.5 text-[28px] font-semibold leading-none tabular-nums tracking-tight">{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

/** One colour per rank in Top stores: a light badge, a bar, and a darker text shade that keeps 4.5:1 on white and on the dark card. */
const STORE_TONES = [
  { badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", bar: "bg-blue-600", text: "text-blue-700 dark:text-blue-300" },
  { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", bar: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300" },
  { badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", bar: "bg-amber-500", text: "text-amber-800 dark:text-amber-300" },
  { badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300", bar: "bg-violet-600", text: "text-violet-700 dark:text-violet-300" },
  { badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", bar: "bg-rose-600", text: "text-rose-700 dark:text-rose-300" },
];
/** "Ling & Sons" -> "LS", "Folira Supermarket" -> "FS", "Costco" -> "CO" */
function initials(name: string) {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "?").slice(0, 2)).toUpperCase();
}

const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const chipBase = "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const chipOn = "border-primary bg-primary font-semibold text-primary-foreground";
const chipOff = "border-input bg-card hover:bg-accent";

export default function PersonalDashboard({ rows, projects, today, afterTrips }: { rows: DashboardRow[]; projects: DashboardProject[]; today: string; /** Cards shown right after the trips (subscriptions, documents) */ afterTrips?: ReactNode }) {
  const [filter, setFilter] = useState<DashboardFilter>(DEFAULT_FILTER);
  const [sheet, setSheet] = useState(false);

  const set = (patch: Partial<DashboardFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const filtered = useMemo(() => filterRows(rows, filter, today), [rows, filter, today]);
  const a = useMemo(() => analyze(rows, filtered, projects, filter, today), [rows, filtered, projects, filter, today]);
  // The category list is built without the category filter, so the other categories stay in reach after one is picked
  const forList = useMemo(() => {
    const f = filterRows(rows, { ...filter, category: "" }, today);
    return analyze(rows, f, projects, { ...filter, category: "" }, today);
  }, [rows, filter, projects, today]);
  const range = resolveRange(filter, today);
  const prev = useMemo(() => previousPeriod(rows, filter, today), [rows, filter, today]);
  const change = changePercent(a.total, prev?.total);
  const busiest = useMemo(() => busiestDay(filtered), [filtered]);

  // Long ranges are grouped so the small trend stays readable
  const grain: Grain = a.days > 800 ? "month" : a.days > 120 ? "week" : "day";
  const trend = useMemo(() => trendSeries(filtered, grain, range, today), [filtered, grain, range.from, range.to, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const peak = trend.length > 1 ? trend.reduce((m, x) => (x.value > m.value ? x : m), trend[0]) : null;
  const heads = forList.byCategory.slice(0, 5);
  const restTotal = forList.byCategory.slice(5).reduce((s, x) => s + x.value, 0);
  const listTotal = forList.total || 1;

  const rangeText = filter.range === "custom" ? "custom dates" : RANGES.find((r) => r.id === filter.range)!.text;
  const sheetFilters = (filter.store ? 1 : 0) + (filter.project ? 1 : 0) + (filter.range === "custom" ? 1 : 0);
  const anyFilter = !!(filter.category || filter.store || filter.project);
  const projectName = projects.find((p) => p.id === filter.project)?.name;

  const active = projects.filter((p) => (p.status || "active") === "active");
  const trips = active.filter((p) => p.kind === "personal_trip");
  const homeProjects = active.filter((p) => p.kind === "home_project");
  const spentOn = (id: string) => {
    const mine = rows.filter((r) => r.projectId === id && r.awg != null);
    return { total: mine.reduce((s, r) => s + (r.awg as number), 0), count: mine.length };
  };

  const clearFilters = () => set({ category: "", store: "", project: "" });
  const toggleCategory = (c: string) => set({ category: filter.category === c ? "" : c });

  return (
    <div className="space-y-4">
      {/* Range + filters */}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Date range" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={filter.range === r.id} onClick={() => set({ range: r.id })} className={cn(chipBase, filter.range === r.id ? chipOn : chipOff)}>
              {r.label}
            </button>
          ))}
          {filter.range === "custom" && (
            <button type="button" aria-pressed="true" onClick={() => setSheet(true)} className={cn(chipBase, chipOn)}>
              {range.from > "0001-01-01" ? longDate(range.from, false) : "Start"} – {range.to < "9999-01-01" ? longDate(range.to, false) : "now"}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={sheetFilters ? `Filters, ${sheetFilters} on` : "Filters"}
          aria-haspopup="dialog"
          onClick={() => setSheet(true)}
          className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", sheetFilters ? "border-primary bg-primary/10 text-primary" : "border-input bg-card")}
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          {sheetFilters > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{sheetFilters}</span>}
        </button>
      </div>

      {anyFilter && (
        <div className="flex items-center justify-between gap-2" data-testid="active-filters">
          <div className="flex min-w-0 flex-wrap gap-2">
            {[
              filter.category && { key: "category", label: filter.category },
              filter.store && { key: "store", label: filter.store },
              filter.project && { key: "project", label: projectName || "Project" },
            ]
              .filter((x): x is { key: "category" | "store" | "project"; label: string } => !!x)
              .map((c) => (
                <span key={c.key} className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-primary py-0 pl-3.5 pr-1.5 text-sm font-semibold text-primary-foreground">
                  <span className="max-w-[10rem] truncate">{c.label}</span>
                  <button type="button" aria-label={`Remove ${c.label} filter`} onClick={() => set({ [c.key]: "" })} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
          </div>
          <button type="button" onClick={clearFilters} className="min-h-[44px] shrink-0 px-2 text-sm font-semibold text-primary">Clear filter</button>
        </div>
      )}

      {a.unconverted > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {plural(a.unconverted, "receipt")} in a currency with no exchange rate yet {a.unconverted !== 1 ? "are" : "is"} left out of the totals.
        </p>
      )}

      {/* Hero: how much, versus before, how it is moving */}
      <section aria-label="Spending summary" className="space-y-2.5 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {filter.category || "Spent"} · {rangeText}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-3xl font-bold tabular-nums tracking-tight" data-testid="personal-total">{money(a.total)}</p>
          {change != null && (
            <span
              data-testid="personal-change"
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold",
                change < 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : change > 0 ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-muted text-muted-foreground",
              )}
            >
              {change < 0 ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : change > 0 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : null}
              {change === 0 ? "No change" : `${Math.abs(change)}% ${change < 0 ? "less" : "more"}`}
            </span>
          )}
        </div>
        {prev && change != null && <p className="text-sm text-muted-foreground">than the {plural(prev.days, "day")} before ({money(prev.total)})</p>}

        {trend.length > 1 && (
          <div className="h-[72px] w-full text-primary md:h-[120px]" role="img" aria-label={`Spending over time in ${BASE_CURRENCY}${peak ? `, peak on ${longDate(peak.key, false)}` : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(k) => longDate(String(k), false)} />
                <Area type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2.5} fill="currentColor" fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {trend.length > 1 && (
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
            <span>{longDate(trend[0].key, false)}</span>
            {peak && <span className="font-semibold text-primary">{longDate(peak.key, false)} (peak)</span>}
            <span>{longDate(trend[trend.length - 1].key, false)}</span>
          </div>
        )}

        <dl className="grid grid-cols-3 gap-2 border-t pt-2.5">
          <div><dd className="text-base font-bold tabular-nums">{a.count}</dd><dt className="text-xs text-muted-foreground">{a.count === 1 ? "receipt" : "receipts"}</dt></div>
          <div><dd className="truncate text-base font-bold tabular-nums">{money(a.avgPerDay)}</dd><dt className="text-xs text-muted-foreground">per day</dt></div>
          <div><dd className="truncate text-base font-bold">{busiest ? shortDay(busiest.date) : "—"}</dd><dt className="text-xs text-muted-foreground">busiest day</dt></div>
        </dl>
      </section>

      {/* Active now: personal trips look like the Business trip card */}
      {!anyFilter && (
        <>
          <h2 className={cn(sectionLabel, "pt-1")}>Active now</h2>
          {trips.length === 0 && homeProjects.length === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              <span>No active trips or projects.</span>
              <span className="flex gap-3 font-semibold text-primary">
                <Link href="/personal/travel/new" className="min-h-[44px] content-center">Start a trip</Link>
                <Link href="/personal/projects/new" className="min-h-[44px] content-center">Start a project</Link>
              </span>
            </div>
          )}
          {trips.map((t) => {
            const spent = spentOn(t.id);
            const badge = tripBadge(t, today);
            return (
              <div key={t.id} data-testid="personal-trip-card" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
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
            );
          })}
          {homeProjects.map((p) => {
            const spent = spentOn(p.id);
            return (
              <Link key={p.id} href={`/personal/projects/${p.id}`} data-testid="personal-project-row" className="flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Hammer className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{p.name}</span>
                  <span className="block text-[13px] text-muted-foreground">{spent.count ? plural(spent.count, "expense") : "No expenses yet"}</span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{money(spent.total)}</span>
                <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
              </Link>
            );
          })}
          {(trips.length > 0 || homeProjects.length > 0) && (
            <div className="flex gap-4 text-sm font-semibold text-primary">
              <Link href="/personal/travel" className="min-h-[44px] content-center">All trips</Link>
              <Link href="/personal/projects" className="min-h-[44px] content-center">All projects</Link>
            </div>
          )}
        </>
      )}

      {afterTrips}

      {a.count === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No personal spending found for these filters. Try a wider date range.
        </div>
      ) : (
        <>
          {/* Where it goes: every row filters the page */}
          <h2 className={cn(sectionLabel, "pt-1")}>Where it goes</h2>
          <section aria-label="Where it goes" className="rounded-2xl border bg-card p-2">
            <div className="flex flex-col items-center gap-2 p-2 md:flex-row md:gap-6">
              <Donut
                parts={[...heads.map((c, i) => ({ label: c.label, value: c.value, color: PALETTE[i % PALETTE.length] })), ...(restTotal > 0 ? [{ label: "Everything else", value: restTotal, color: PALETTE[5] }] : [])]}
                total={forList.total}
                caption={`${filter.range === "custom" ? "Custom" : RANGES.find((r) => r.id === filter.range)!.label} \u00b7 ${BASE_CURRENCY}`}
              />
              <div className="w-full min-w-0 md:max-w-[22rem] md:flex-1">
            <ul>
              {heads.map((c, i) => {
                const on = filter.category === c.label;
                return (
                  <li key={c.label}>
                    <button type="button" aria-pressed={on} onClick={() => toggleCategory(c.label)} className={cn("flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on && "bg-primary/10")}>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                      <span className={cn("min-w-0 flex-1 truncate text-[15px]", on ? "font-semibold" : "font-medium")}>{c.label}</span>
                      <span className="text-[15px] font-semibold tabular-nums text-muted-foreground">{Math.round((c.value / listTotal) * 100)}%</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
              {restTotal > 0 && (
                <li className="flex min-h-[44px] items-center gap-2.5 px-2.5 py-1.5 text-muted-foreground">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PALETTE[5] }} aria-hidden="true" />
                  <span className="flex-1 text-[15px]">Everything else</span>
                  <span className="text-[15px] font-semibold tabular-nums">{Math.round((restTotal / listTotal) * 100)}%</span>
                  <span className="w-4" />
                </li>
              )}
            </ul>
              </div>
            </div>
          </section>

          <h2 className={cn(sectionLabel, "pt-1")}>Top stores</h2>
          <section aria-label="Top stores" className="rounded-2xl border bg-card p-2">
            <ul>
              {a.topMerchants.map((m, i) => {
                const tone = STORE_TONES[i % STORE_TONES.length];
                const share = (m.value / (a.total || 1)) * 100;
                return (
                  <li key={m.label}>
                    <button type="button" aria-pressed={filter.store === m.label} onClick={() => set({ store: filter.store === m.label ? "" : m.label })} className={cn("w-full rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", filter.store === m.label && "bg-primary/10")}>
                      <span className="flex min-h-[44px] items-center gap-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold", tone.badge)} aria-hidden="true">{initials(m.label)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{m.label}</span>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{plural(m.visits, "visit")}</span>
                          </span>
                          {m.kinds && <span className="block truncate text-[13px] text-muted-foreground">{m.kinds}</span>}
                        </span>
                        <span className="text-right">
                          <span className="block text-[15px] font-bold tabular-nums">{money(m.value)}</span>
                          <span className={cn("block text-[13px] font-semibold tabular-nums", tone.text)}>{Math.round(share * 10) / 10}% of spend</span>
                        </span>
                      </span>
                      <span className="mt-2 block h-1.5 rounded-full bg-muted" aria-hidden="true"><span className={cn("block h-1.5 rounded-full", tone.bar)} style={{ width: `${Math.min(100, share)}%` }} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <details className="rounded-2xl border bg-card px-4 py-1">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold">More detail</summary>
            <div className="space-y-5 pb-4 pt-1">
              <div>
                <h3 className="mb-1 text-sm font-semibold">Average daily spend per trip</h3>
                {a.perProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No project or trip spending in this range.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-2 font-medium">Name</th><th className="py-1 pr-2 font-medium">Days</th><th className="py-1 text-right font-medium">Per day</th></tr></thead>
                    <tbody>
                      {a.perProject.map((p) => (
                        <tr key={p.id} className="border-t"><td className="max-w-[10rem] truncate py-2 pr-2">{p.name}</td><td className="py-2 pr-2 tabular-nums">{p.days}</td><td className="py-2 text-right font-semibold tabular-nums">{money(p.perDay)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Totals by currency</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-2 font-medium">Currency</th><th className="py-1 pr-2 text-right font-medium">Original</th><th className="py-1 text-right font-medium">In {BASE_CURRENCY}</th></tr></thead>
                  <tbody>
                    {a.byCurrency.map((c) => (
                      <tr key={c.currency} className="border-t"><td className="py-2 pr-2">{c.currency}</td><td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(c.original, c.currency)}</td><td className="py-2 text-right font-semibold tabular-nums">{c.awg == null ? "no rate" : money(c.awg)}</td></tr>
                    ))}
                    <tr className="border-t-2"><td className="py-2 font-semibold">Total</td><td /><td className="py-2 text-right font-bold tabular-nums">{money(a.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </>
      )}
      <p className="text-xs text-muted-foreground">Only your own personal receipts are counted. Trip expenses stay in the business view.</p>

      {sheet && (
        <FiltersSheet
          filter={filter}
          set={set}
          stores={a.stores}
          projects={projects}
          count={a.count}
          from={range.from > "0001-01-01" ? range.from : ""}
          to={range.to < "9999-01-01" ? range.to : ""}
          onReset={() => setFilter((f) => ({ ...DEFAULT_FILTER, category: f.category }))}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}

function FiltersSheet({ filter, set, stores, projects, count, from, to, onReset, onClose }: {
  filter: DashboardFilter;
  set: (p: Partial<DashboardFilter>) => void;
  stores: string[];
  projects: DashboardProject[];
  count: number;
  from: string;
  to: string;
  onReset: () => void;
  onClose: () => void;
}) {
  const [allStores, setAllStores] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = allStores || stores.length <= 8 ? stores : stores.slice(0, 8);
  const pick = "flex-wrap";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid="filters-sheet">
      <button type="button" aria-label="Close filters" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-slate-900/50" />
      <div role="dialog" aria-modal="true" aria-label="Filters" className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-background p-4 pb-5 shadow-2xl sm:rounded-3xl">
        <span className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Filters</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onReset} className="min-h-[44px] px-2 text-sm font-semibold text-primary">Reset</button>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted-foreground">Dates</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">From<Input type="date" value={from} onChange={(e) => set({ range: "custom", from: e.target.value, to: filter.range === "custom" ? filter.to : to })} className="text-foreground" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">To<Input type="date" value={to} onChange={(e) => set({ range: "custom", to: e.target.value, from: filter.range === "custom" ? filter.from : from })} className="text-foreground" /></label>
          </div>
          <p className="text-xs text-muted-foreground">Picking dates here switches the range to custom.</p>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted-foreground">Store</p>
          <div className={cn("flex gap-2", pick)}>
            <button type="button" aria-pressed={!filter.store} onClick={() => set({ store: "" })} className={cn(chipBase, !filter.store ? chipOn : chipOff)}>All stores</button>
            {shown.map((s) => (
              <button key={s} type="button" aria-pressed={filter.store === s} onClick={() => set({ store: s })} className={cn(chipBase, filter.store === s ? chipOn : chipOff)}>{s}</button>
            ))}
            {!allStores && stores.length > 8 && (
              <button type="button" onClick={() => setAllStores(true)} className={cn(chipBase, chipOff, "font-semibold text-primary")}>+ {stores.length - 8} more</button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-muted-foreground">Project or trip</p>
          <div className={cn("flex gap-2", pick)}>
            <button type="button" aria-pressed={!filter.project} onClick={() => set({ project: "" })} className={cn(chipBase, !filter.project ? chipOn : chipOff)}>Everything</button>
            {projects.map((p) => (
              <button key={p.id} type="button" aria-pressed={filter.project === p.id} onClick={() => set({ project: p.id })} className={cn(chipBase, filter.project === p.id ? chipOn : chipOff)}>
                {p.kind === "home_project" ? <Hammer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : <Plane className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                <span className="max-w-[10rem] truncate">{p.name}</span>
              </button>
            ))}
            {projects.length === 0 && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Plus className="h-3.5 w-3.5" aria-hidden="true" />No trips or projects yet.</p>}
          </div>
        </div>

        <button type="button" onClick={onClose} className="min-h-[52px] rounded-2xl bg-primary text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          Show {plural(count, "receipt")}
        </button>
      </div>
    </div>
  );
}
