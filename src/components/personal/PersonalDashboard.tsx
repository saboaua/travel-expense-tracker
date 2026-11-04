"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Coins, ShoppingBag, Tags } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bars } from "@/components/personal/Bars";
import { formatCurrency } from "@/lib/utils";
import {
  BASE_CURRENCY,
  DEFAULT_FILTER,
  analyze,
  filterRows,
  resolveRange,
  trendSeries,
  type DashboardFilter,
  type DashboardProject,
  type DashboardRow,
  type Grain,
} from "@/lib/personal/dashboard";

// Different in lightness as well as hue, so the slices can be told apart without relying on colour alone.
const PALETTE = ["#1d4ed8", "#f59e0b", "#0d9488", "#7c3aed", "#e11d48", "#64748b"];
const money = (n: number) => formatCurrency(n, BASE_CURRENCY);

function shortDate(key: string, grain: Grain) {
  const d = new Date(`${key}T00:00:00Z`);
  if (grain === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PersonalDashboard({ rows, projects, today }: { rows: DashboardRow[]; projects: DashboardProject[]; today: string }) {
  const [filter, setFilter] = useState<DashboardFilter>(DEFAULT_FILTER);
  const [catView, setCatView] = useState<"donut" | "bars">("donut");
  const [grain, setGrain] = useState<Grain>("day");

  const set = (patch: Partial<DashboardFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const filtered = useMemo(() => filterRows(rows, filter, today), [rows, filter, today]);
  const a = useMemo(() => analyze(rows, filtered, projects, filter, today), [rows, filtered, projects, filter, today]);
  const range = resolveRange(filter, today);
  const trend = useMemo(() => trendSeries(filtered, grain, range, today), [filtered, grain, range.from, range.to, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top five categories, the rest together, so the donut stays readable
  const slices = useMemo(() => {
    const head = a.byCategory.slice(0, 5);
    const rest = a.byCategory.slice(5).reduce((s, x) => s + x.value, 0);
    return rest > 0 ? [...head, { label: "Other", value: Math.round(rest * 100) / 100 }] : head;
  }, [a.byCategory]);

  const hasFilter = filter.range !== DEFAULT_FILTER.range || !!filter.store || !!filter.project;
  const topCategory = a.byCategory[0];
  const topMerchant = a.topMerchants[0];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
          <label className="col-span-2 space-y-1 text-xs font-medium text-muted-foreground md:col-span-1">
            Date range
            <Select value={filter.range} onChange={(e) => set({ range: e.target.value as DashboardFilter["range"] })} className="text-foreground">
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
              <option value="custom">Custom…</option>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            From
            <Input type="date" value={filter.range === "custom" ? filter.from : range.from > "0001-01-01" ? range.from : ""} disabled={filter.range !== "custom"} onChange={(e) => set({ from: e.target.value })} className="text-foreground" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            To
            <Input type="date" value={filter.range === "custom" ? filter.to : range.to < "9999-01-01" ? range.to : ""} disabled={filter.range !== "custom"} onChange={(e) => set({ to: e.target.value })} className="text-foreground" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Store / merchant
            <Select value={filter.store} onChange={(e) => set({ store: e.target.value })} className="text-foreground">
              <option value="">All stores</option>
              {a.stores.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Project / trip
            <Select value={filter.project} onChange={(e) => set({ project: e.target.value })} className="text-foreground">
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </label>
          <Button type="button" variant="ghost" onClick={() => setFilter(DEFAULT_FILTER)} disabled={!hasFilter} className="col-span-2 md:col-span-1">
            Reset
          </Button>
        </CardContent>
      </Card>

      {a.unconverted > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {a.unconverted} receipt{a.unconverted !== 1 ? "s" : ""} in a currency with no exchange rate yet {a.unconverted !== 1 ? "are" : "is"} left out of the totals.
        </p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Coins className="h-4 w-4" />Total spent ({BASE_CURRENCY})</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold sm:text-3xl">{money(a.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{a.count} receipt{a.count !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Average per day</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold sm:text-3xl">{money(a.avgPerDay)}</p>
            <p className="mt-1 text-xs text-muted-foreground">over {a.days} day{a.days !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Tags className="h-4 w-4" />Top category</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="truncate text-2xl font-bold sm:text-3xl">{topCategory?.label ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{topCategory ? `${money(topCategory.value)} · ${Math.round((topCategory.value / (a.total || 1)) * 100)}%` : "No spending in this range"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" />Top merchant</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="truncate text-2xl font-bold sm:text-3xl">{topMerchant?.label ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{topMerchant ? `${money(topMerchant.value)} · ${topMerchant.visits} visit${topMerchant.visits !== 1 ? "s" : ""}` : "No spending in this range"}</p>
          </CardContent>
        </Card>
      </div>

      {a.count === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No personal spending found for these filters. Try a wider date range.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Category */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Spending by category</CardTitle>
                <Seg label="Category chart type" value={catView} onChange={setCatView} options={[{ v: "donut", label: "Donut" }, { v: "bars", label: "Bars" }]} />
              </CardHeader>
              <CardContent>
                {catView === "donut" ? (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="h-48 w-48 shrink-0" role="img" aria-label={`Spending by category: ${slices.map((s) => `${s.label} ${money(s.value)}`).join(", ")}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88} paddingAngle={1} stroke="none" isAnimationActive={false}>
                            {slices.map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => money(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
                      {slices.map((s, i) => (
                        <li key={s.label} className="flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          <span className="font-medium tabular-nums">{money(s.value)}</span>
                          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round((s.value / (a.total || 1)) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="h-56 w-full" role="img" aria-label="Bar chart of spending by category">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={slices} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.12} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "currentColor" }} tickFormatter={(v) => String(Math.round(Number(v)))} className="text-muted-foreground" />
                        <YAxis type="category" dataKey="label" width={86} tick={{ fontSize: 12, fill: "currentColor" }} className="text-muted-foreground" />
                        <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {slices.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trend */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Trend over time</CardTitle>
                <Seg label="Trend grouping" value={grain} onChange={setGrain} options={[{ v: "day", label: "Daily" }, { v: "week", label: "Weekly" }, { v: "month", label: "Monthly" }]} />
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full" role="img" aria-label={`Spending over time in ${BASE_CURRENCY}, grouped ${grain === "day" ? "daily" : grain === "week" ? "weekly" : "monthly"}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ left: 0, right: 12, top: 8 }}>
                      <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
                      <XAxis dataKey="key" tickFormatter={(k) => shortDate(String(k), grain)} tick={{ fontSize: 11, fill: "currentColor" }} minTickGap={28} className="text-muted-foreground" />
                      <YAxis width={44} tick={{ fontSize: 11, fill: "currentColor" }} tickFormatter={(v) => String(Math.round(Number(v)))} className="text-muted-foreground" />
                      <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(k) => shortDate(String(k), grain)} />
                      <Area type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2.5} fill={PALETTE[0]} fillOpacity={0.14} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Top merchants</CardTitle></CardHeader>
              <CardContent><Bars rows={a.topMerchants.map((m) => ({ label: m.label, value: m.value }))} format={money} /></CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average daily spend per trip</CardTitle>
                <CardDescription>Personal trips and home projects</CardDescription>
              </CardHeader>
              <CardContent>
                {a.perProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No project or trip spending in this range.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-2 font-medium">Name</th>
                          <th className="py-1 pr-2 font-medium">Days</th>
                          <th className="py-1 text-right font-medium">Per day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.perProject.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="max-w-[10rem] truncate py-2 pr-2">{p.name}</td>
                            <td className="py-2 pr-2 tabular-nums">{p.days}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{money(p.perDay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Totals by currency</CardTitle>
                <CardDescription>Converted to {BASE_CURRENCY}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Currency</th>
                        <th className="py-1 pr-2 text-right font-medium">Original</th>
                        <th className="py-1 text-right font-medium">In {BASE_CURRENCY}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.byCurrency.map((c) => (
                        <tr key={c.currency} className="border-t">
                          <td className="py-2 pr-2">{c.currency}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(c.original, c.currency)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{c.awg == null ? "no rate" : money(c.awg)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2">
                        <td className="py-2 font-semibold">Total</td>
                        <td />
                        <td className="py-2 text-right font-bold tabular-nums">{money(a.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">Only your own personal receipts are counted. Trip expenses stay in the business view.</p>
    </div>
  );
}
