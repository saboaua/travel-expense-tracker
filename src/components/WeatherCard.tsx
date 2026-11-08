"use client";

import { useEffect, useState } from "react";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, MapPin, Moon, Sun,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatTemp, skyKind, usesFahrenheit, type SkyKind, type WeatherNow } from "@/lib/weather";

const CACHE_KEY = "weather-now-v1";
const CACHE_MS = 10 * 60 * 1000;

function SkyIcon({ kind, isDay, className }: { kind: SkyKind; isDay: boolean; className?: string }) {
  const map = {
    clear: isDay ? Sun : Moon,
    partly: isDay ? CloudSun : CloudMoon,
    cloudy: Cloud,
    fog: CloudFog,
    drizzle: CloudDrizzle,
    rain: CloudRain,
    snow: CloudSnow,
    storm: CloudLightning,
  } as const;
  const Icon = map[kind];
  const color = kind === "clear" ? "text-amber-500" : kind === "partly" ? "text-sky-500" : kind === "storm" ? "text-violet-500" : "text-slate-500";
  return <Icon className={`${color} ${className || ""}`} aria-hidden="true" />;
}

type State = { status: "loading" } | { status: "ready"; data: WeatherNow } | { status: "error" };

/** Position of the device right now; null if permission is denied or unavailable. */
function getPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false }
    );
  });
}

/**
 * `inline` is the version that lives inside the welcome card: a soft panel instead of a card of its own.
 */
export function WeatherCard({ inline = false }: { inline?: boolean } = {}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { at, data } = JSON.parse(raw) as { at: number; data: WeatherNow };
        if (Date.now() - at < CACHE_MS) {
          setState({ status: "ready", data });
          return;
        }
      }
    } catch {
      // storage unavailable: just fetch
    }

    (async () => {
      const pos = await getPosition();
      try {
        const qs = pos ? `?lat=${pos.lat}&lon=${pos.lon}` : "";
        const res = await fetch(`/api/weather${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error("weather failed");
        const data = (await res.json()) as WeatherNow;
        if (cancelled) return;
        setState({ status: "ready", data });
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
        } catch {
          // ignore
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const panel = "flex w-full items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 sm:w-auto sm:gap-4 sm:px-5";

  if (state.status === "loading" && inline) {
    return (
      <div className={`${panel} min-h-[4.25rem]`} aria-busy="true">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  // Nothing to show is nothing taken: no "unavailable" panel on the welcome card
  if (state.status === "error" && inline) return null;

  if (state.status === "loading") {
    return (
      <Card className="flex min-h-[7rem] flex-col justify-center gap-3 p-5" aria-busy="true">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="flex min-h-[7rem] flex-col justify-center gap-1 p-5">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> Weather</p>
        <p className="text-sm text-muted-foreground">Unavailable right now</p>
      </Card>
    );
  }

  const { data } = state;
  const sky = skyKind(data.code);
  const fahrenheit = usesFahrenheit(data.countryCode);

  if (inline) {
    return (
      <div className={panel}>
        <SkyIcon kind={sky.kind} isDay={data.isDay} className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
        <span className="sr-only">{sky.label}</span>
        <div className="min-w-0 flex-1 sm:flex-none">
          <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm" title={data.city || undefined}>{data.city || "Your location"}</p>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold leading-tight sm:text-3xl">{formatTemp(data.tempC, fahrenheit)}</span>
            {data.rainChance != null && (
              <span className="flex items-center gap-1 text-sm font-medium sm:text-base" title="Chance of rain today">
                <Droplets className="h-4 w-4 text-sky-500" aria-hidden="true" />
                {data.rainChance}%<span className="sr-only"> chance of rain today</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex min-h-[7rem] flex-col justify-center gap-2 p-4 sm:p-5">
      <p className="truncate text-lg font-semibold leading-tight sm:text-xl" title={data.city || undefined}>{data.city || "Your location"}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-2xl font-bold sm:text-3xl">{formatTemp(data.tempC, fahrenheit)}</span>
        <span title={sky.label} className="flex items-center"><SkyIcon kind={sky.kind} isDay={data.isDay} className="h-6 w-6" /><span className="sr-only">{sky.label}</span></span>
        {data.rainChance != null && (
          <span className="flex items-center gap-1 text-base font-medium sm:text-lg" title="Chance of rain today">
            <Droplets className="h-4 w-4 text-sky-500" aria-hidden="true" />
            {data.rainChance}%<span className="sr-only"> chance of rain today</span>
          </span>
        )}
      </div>
    </Card>
  );
}
