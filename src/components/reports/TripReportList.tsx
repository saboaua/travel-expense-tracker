"use client";

import { Select } from "@/components/ui/select";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Check, Download, MapPin, CalendarDays, Search, ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDateRange } from "@/lib/utils";

export type TripReportRow = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  total: number; // USD in the selected year
  count: number;
};

type Filter = "all" | "active" | "completed";
type Sort = "recent" | "spend";

export function TripReportList({ trips, year }: { trips: TripReportRow[]; year: number }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const maxTotal = Math.max(...trips.map((t) => t.total), 0);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trips
      .filter((t) => (filter === "all" || t.status === filter) && (!q || `${t.name} ${t.destination || ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (sort === "spend" ? b.total - a.total : b.start_date.localeCompare(a.start_date)));
  }, [trips, query, filter, sort]);

  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            aria-label="Search trips"
          />
        </div>
        <div className="flex items-center gap-2">
          {chip("all", "All")}
          {chip("active", "Active")}
          {chip("completed", "Completed")}
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto min-w-fit h-9 px-2 text-xs py-0" aria-label="Sort trips">
            <option value="recent">Newest</option>
            <option value="spend">Highest spend</option>
          </Select>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{trips.length === 0 ? `No trips in ${year} yet` : "No trips match."}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((t) => {
            const completed = t.status === "completed";
            return (
              <li key={t.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{t.name}</h3>
                      {completed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Check className="h-3 w-3" /> Completed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {t.destination && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.destination}</span>}
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateRange(t.start_date, t.end_date)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(t.total, "USD")}</p>
                    <p className="text-xs text-muted-foreground">{t.count} expense{t.count !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                {maxTotal > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-muted" aria-hidden="true">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max((t.total / maxTotal) * 100, t.total > 0 ? 2 : 0)}%` }} />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/api/export/trip/${t.id}/excel`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent"><Download className="h-3.5 w-3.5" /> Excel</a>
                  <a href={`/api/export/trip/${t.id}/zip`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-accent"><Archive className="h-3.5 w-3.5" /> ZIP with receipts</a>
                  <Link href={`/trips/${t.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-primary hover:bg-primary/10">Open trip <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
