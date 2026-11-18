"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plane } from "lucide-react";
import { StatusChip } from "@/components/flights/FlightPanel";
import { clock, durationMinutes, durationText, nextFlight, shownArrival, shownDeparture, type TripFlight } from "@/lib/flights";

const shortDate = (day: string) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const time = (local: string | null) => {
  const c = clock(local);
  return c ? `${c.time} ${c.period}` : "--:--";
};

/** Airline badge, big airport codes with local times, duration pill. Desktop only; the phone gets the compact block. */
function FlightStrip({ f }: { f: TripFlight }) {
  const dur = durationText(durationMinutes(f));
  const code = f.flight_number.split(" ")[0];
  const meta = [f.aircraft, shortDate(f.flight_date)].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border bg-muted/30 p-3.5" data-testid="featured-flight">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-900 text-xs font-bold text-white" aria-hidden="true">{code.slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{[f.airline, f.flight_number].filter(Boolean).join(" · ")}</p>
          {meta && <p className="truncate text-[13px] text-muted-foreground">{meta}</p>}
        </div>
        <StatusChip flight={f} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold leading-none tracking-tight">{f.dep_iata ?? "—"}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{time(shownDeparture(f))}</p>
          <p className="text-[13px] text-muted-foreground">{f.dep_city ?? f.dep_name ?? ""}</p>
        </div>
        <div className="min-w-10 flex-1 text-center">
          {dur && <span className="inline-block whitespace-nowrap rounded-full bg-background px-2.5 py-0.5 text-[13px] text-muted-foreground ring-1 ring-border">{dur} {"·"} Nonstop</span>}
          <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full border-2 border-slate-400" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <Plane className="h-[18px] w-[18px] shrink-0 text-primary" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-primary" />
          </div>
          {f.cabin && <p className="mt-1.5 text-[13px] text-muted-foreground">{f.flight_number} {"·"} {f.cabin}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold leading-none tracking-tight">{f.arr_iata ?? "—"}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{time(shownArrival(f))}</p>
          <p className="text-[13px] text-muted-foreground">{f.arr_city ?? f.arr_name ?? ""}</p>
        </div>
      </div>
    </div>
  );
}

/** Phone: the whole flight is one tappable block that opens the flight details. */
function CompactFlight({ f, href, more }: { f: TripFlight; href: string; more: number }) {
  const dur = durationText(durationMinutes(f));
  return (
    <Link href={href} data-testid="featured-flight-compact" aria-label={`Flight details for ${f.flight_number}`} className="flex min-h-14 items-center gap-2 rounded-xl border bg-muted/30 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-[11px] font-bold text-white" aria-hidden="true">{f.flight_number.slice(0, 2)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.flight_number}{f.airline ? ` · ${f.airline}` : ""}</span>
          <StatusChip flight={f} />
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          <span>{f.dep_iata ?? "?"} {time(shownDeparture(f))}</span>
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-hidden="true">{"—"} {dur ?? ""} <Plane className="h-3.5 w-3.5 text-primary" /> {"—"}</span>
          <span>{f.arr_iata ?? "?"} {time(shownArrival(f))}</span>
        </p>
        {more > 0 && <p className="text-xs text-muted-foreground">+{more} more flight{more === 1 ? "" : "s"}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}


/** The flight line on a trip card. It picks the next flight with the phone's own clock (and again every minute), so a page that was saved earlier, or left open, still moves on to the return once the outbound has landed. */
export function FeaturedFlight({ flights, serverNow, href }: { flights: TripFlight[]; serverNow: number; href: string }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const back = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, []);
  const f = nextFlight(flights, now);
  if (!f) return null;
  return (
    <>
      <div className="hidden md:block"><FlightStrip f={f} /></div>
      <div className="md:hidden"><CompactFlight f={f} href={href} more={flights.length - 1} /></div>
    </>
  );
}
