"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, CloudSunRain, MapPin, Sun, WifiOff } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { type TripDay, type TripWeather as Data, isRainy, weatherTip } from "@/lib/trip-weather";
import { skyKind, usesFahrenheit, type SkyKind } from "@/lib/weather";

type State =
  | { s: "loading" }
  | { s: "ok"; data: Data; savedAt: number | null }
  | { s: "early"; opensOn: string }
  | { s: "nolocation" }
  | { s: "none" };

const ICON: Record<SkyKind, typeof Sun> = { clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const COLOR: Record<SkyKind, string> = { clear: "text-amber-600", partly: "text-amber-600", cloudy: "text-slate-600", fog: "text-slate-600", drizzle: "text-blue-700", rain: "text-blue-700", snow: "text-sky-700", storm: "text-violet-700" };

const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const span = (days: TripDay[]) => (days.length > 1 ? `${dayDate(days[0].date)} – ${dayDate(days[days.length - 1].date).replace(/^\w+ /, "")}` : dayDate(days[0].date));

const key = (destination: string, start: string, end: string) => `trip-weather-v1:${destination.toLowerCase()}|${start}|${end}`;
const read = (k: string): { data: Data; at: number } | null => {
  try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && Array.isArray(v.data?.days) ? v : null; } catch { return null; }
};
const write = (k: string, data: Data) => { try { localStorage.setItem(k, JSON.stringify({ data, at: Date.now() })); } catch { /* storage unavailable */ } };
const ago = (at: number) => { const h = Math.round((Date.now() - at) / 3600000); return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };

function Shell({ place, sub, right, children }: { place: string; sub: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section data-testid="trip-weather" aria-label={`Weather in ${place}`} className="space-y-2.5 rounded-2xl border bg-card p-3.5 shadow-sm md:px-5 md:py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><CloudSun className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight">Weather in {place}</h3>
          <p className="text-[13px] text-muted-foreground">{sub}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** The forecast for the days of a trip, under the trip card. Shows nothing when there is no destination or the trip is over. */
export function TripWeather({ destination, start, end, today, editHref }: { destination: string | null; start: string; end: string | null; today: string; editHref: string }) {
  const [st, setSt] = useState<State>({ s: "loading" });
  const dest = (destination || "").trim();

  useEffect(() => {
    if (!dest) { setSt({ s: "none" }); return; }
    const k = key(dest, start, end || "");
    let off = false;
    const cached = read(k);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) { setSt({ s: "ok", data: cached.data, savedAt: null }); return; }
    (async () => {
      try {
        const res = await fetch(`/api/trip-weather?destination=${encodeURIComponent(dest)}&start=${start}${end ? `&end=${end}` : ""}`);
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        if (off) return;
        if (j.status === "ok") { write(k, j); setSt({ s: "ok", data: j, savedAt: null }); }
        else if (j.status === "early") setSt({ s: "early", opensOn: j.opensOn });
        else if (j.status === "nolocation") setSt({ s: "nolocation" });
        else setSt({ s: "none" });
      } catch {
        if (off) return;
        setSt(cached ? { s: "ok", data: cached.data, savedAt: cached.at } : { s: "none" });
      }
    })();
    return () => { off = true; };
  }, [dest, start, end]);

  if (st.s === "loading" || st.s === "none") return null;
  if (st.s === "early") {
    return (
      <Shell place={dest} sub={dest}>
        <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          <Calendar className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div><b className="block text-[15px] text-foreground">Forecast opens {formatDate(st.opensOn)}</b>Forecasts reach 16 days ahead. This card fills in by itself when your trip comes into range.</div>
        </div>
      </Shell>
    );
  }
  if (st.s === "nolocation") {
    return (
      <Shell place={dest} sub={dest}>
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div><b className="block text-[15px]">We couldn&apos;t find &ldquo;{dest}&rdquo; on the map</b>Add a city or country to the destination, for example Panama City.</div>
        </div>
        <Link href={editHref} className="inline-flex min-h-[44px] items-center rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-accent">Edit destination</Link>
      </Shell>
    );
  }

  const { data, savedAt } = st;
  const f = usesFahrenheit(data.countryCode);
  const days = data.days;
  const tip = weatherTip(days, today);
  const t = (c: number) => `${Math.round(f ? (c * 9) / 5 + 32 : c)}°`;
  const lo = Math.min(...days.map((d) => d.lo)) - 1;
  const hi = Math.max(...days.map((d) => d.hi)) + 1;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const sub = `${span(days)} · ${savedAt ? "saved forecast" : today >= days[0].date && today <= days[days.length - 1].date && days[0].date === today ? "today to the end of your trip" : "your trip dates"}`;
  const right = savedAt
    ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" />Saved {ago(savedAt)}</span>
    : <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{f ? "°F" : "°C"}</span>;

  return (
    <Shell place={data.place} sub={sub} right={right}>
      {tip && <p className="flex min-h-9 items-center gap-2 rounded-xl bg-primary/10 px-3 py-1.5 text-[13px] font-semibold leading-snug text-primary"><CloudSunRain className="h-4 w-4 shrink-0" aria-hidden="true" />{tip}</p>}
      {/* Phone: one row per day */}
      <ul className="md:hidden">
        {days.map((d) => {
          const k = skyKind(d.code);
          const Icon = ICON[k.kind];
          const isToday = d.date === today;
          return (
            <li key={d.date} className={`flex min-h-11 items-center gap-2 rounded-xl px-2 ${isToday ? "bg-muted" : ""}`}>
              <span className="w-[50px] shrink-0 text-sm font-semibold leading-tight">{isToday ? "Today" : dayName(d.date)}<span className="block text-xs font-normal text-muted-foreground">{dayDate(d.date)}</span></span>
              <span className="flex w-[62px] shrink-0 items-center gap-1"><Icon className={`h-[22px] w-[22px] ${COLOR[k.kind]}`} aria-label={k.label} role="img" />{d.rain != null && <span className={`text-xs font-semibold ${isRainy(d) ? "text-blue-700" : "text-muted-foreground"}`}>{d.rain}%</span>}</span>
              <span className="w-[26px] shrink-0 text-right text-sm text-muted-foreground">{t(d.lo)}</span>
              <span className="relative h-1.5 min-w-6 flex-1 rounded-full bg-muted" aria-hidden="true"><span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 to-amber-500" style={{ left: `${pct(d.lo)}%`, width: `${Math.max(pct(d.hi) - pct(d.lo), 6)}%` }} /></span>
              <span className="w-[30px] shrink-0 text-sm font-semibold">{t(d.hi)}</span>
            </li>
          );
        })}
      </ul>
      {/* Desktop: one tile per day */}
      <ul className="hidden gap-2.5 md:grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const k = skyKind(d.code);
          const Icon = ICON[k.kind];
          const isToday = d.date === today;
          return (
            <li key={d.date} className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center ${isToday ? "border-primary/40 bg-primary/10" : "bg-muted/40"}`}>
              <span className="text-sm font-semibold">{isToday ? "Today" : dayName(d.date)}</span>
              <span className="-mt-1 text-xs text-muted-foreground">{dayDate(d.date)}</span>
              <Icon className={`h-7 w-7 ${COLOR[k.kind]}`} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-lg font-bold">{t(d.hi)}</span>
              <span className="-mt-1 text-sm text-muted-foreground">{t(d.lo)}</span>
              {d.rain != null && <span className={`text-xs font-semibold ${isRainy(d) ? "text-blue-700" : "text-muted-foreground"}`}>{d.rain}% rain</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Forecast from Open-Meteo{savedAt ? "" : ` · updated ${new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}</p>
    </Shell>
  );
}
