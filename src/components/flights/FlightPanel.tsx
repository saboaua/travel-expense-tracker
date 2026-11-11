"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Plane, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  arrivalDayOffset, clock, durationMinutes, durationText, maskPnr, shownArrival, shownDeparture, statusView, zoneNote, FLIGHT_LEGS,
  type StatusTone, type TripFlight,
} from "@/lib/flights";

const TONE: Record<StatusTone, string> = {
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  bad: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  info: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
  muted: "bg-muted text-foreground/80",
};
const DOT: Record<StatusTone, string> = { ok: "bg-emerald-600", warn: "bg-amber-600", bad: "bg-red-600", info: "bg-blue-600", muted: "bg-slate-500" };

export function StatusChip({ flight }: { flight: Pick<TripFlight, "status" | "source" | "dep_local" | "dep_est_local"> }) {
  const v = statusView(flight);
  return (
    <span data-testid="flight-status" className={cn("inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold", TONE[v.tone])}>
      <span className={cn("h-2 w-2 rounded-full", DOT[v.tone])} aria-hidden="true" />
      {v.label}
    </span>
  );
}

/** "2 min ago", "3 h ago". */
function ago(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Time({ local, late }: { local: string | null; late?: boolean }) {
  const c = clock(local);
  if (!c) return <span className="text-2xl font-bold text-muted-foreground sm:text-3xl">--:--</span>;
  return (
    <span className={cn("text-[26px] font-bold leading-none tracking-tight tabular-nums sm:text-3xl", late && "text-amber-700 dark:text-amber-300")}>
      {c.time}
      <span className="ml-1 text-[13px] font-semibold text-muted-foreground">{c.period}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold">{children}</dd>
    </div>
  );
}

/** One flight: airline and live status, the route in local times, then the booking details. */
export function FlightPanel({ flight: f }: { flight: TripFlight }) {
  const [showPnr, setShowPnr] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  const late = !!f.dep_est_local;
  const dur = durationText(durationMinutes(f));
  const plus = arrivalDayOffset(f);
  const code = f.flight_number.split(" ")[0];
  const synced = f.source === "auto" ? ago(f.last_synced_at, now) : null;
  const dep = shownDeparture(f);
  const arr = shownArrival(f);

  return (
    <div className="rounded-2xl border bg-muted/30 p-3.5 sm:p-4" data-testid="flight-panel">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-900 text-xs font-bold text-white" aria-hidden="true">{code.slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{[f.airline, f.flight_number].filter(Boolean).join(" · ")}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {[f.aircraft, f.flight_date && new Date(`${f.flight_date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), FLIGHT_LEGS.find((l) => l.id === f.leg)?.label].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="hidden sm:inline-flex"><StatusChip flight={f} /></span>
      </div>
      <div className="mt-2.5 sm:hidden"><StatusChip flight={f} /></div>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div>
          <Time local={dep} late={late} />
          <p className="mt-1 text-[15px] font-bold">{f.dep_iata ?? "—"}</p>
          <p className="text-[13px] text-muted-foreground">{f.dep_city ?? f.dep_name ?? ""}</p>
        </div>
        <div className="min-w-10 flex-1 text-center">
          {dur && <p className="hidden whitespace-nowrap text-[13px] text-muted-foreground sm:block">{dur} · Nonstop</p>}
          <div className="my-1.5 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full border-2 border-slate-400" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <Plane className="h-[18px] w-[18px] shrink-0 text-primary" />
            <span className="flex-1 border-t-2 border-dashed border-slate-400" />
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-primary" />
          </div>
        </div>
        <div className="text-right">
          <Time local={arr} late={!!f.arr_est_local} />
          {plus !== 0 && <sup className="ml-0.5 text-xs font-semibold text-muted-foreground">{plus > 0 ? `+${plus}` : plus}</sup>}
          <p className="mt-1 text-[15px] font-bold">{f.arr_iata ?? "—"}</p>
          <p className="text-[13px] text-muted-foreground">{f.arr_city ?? f.arr_name ?? ""}</p>
        </div>
      </div>
      {dur && <p className="mt-0.5 text-center text-[13px] text-muted-foreground sm:hidden">{dur} · Nonstop</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">{zoneNote(f)}</p>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3.5 sm:grid-cols-4">
        <Field label="Confirmation">
          <span className="flex items-center gap-1.5">
            <span data-testid="flight-pnr" className="tabular-nums">{f.pnr ? (showPnr ? f.pnr : maskPnr(f.pnr)) : "—"}</span>
            {f.pnr && (
              <button
                type="button"
                onClick={() => setShowPnr((s) => !s)}
                aria-label={showPnr ? "Hide confirmation code" : "Show confirmation code"}
                aria-pressed={showPnr}
                className="-my-3 -mr-2 flex h-11 w-11 items-center justify-center text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {showPnr ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
            )}
          </span>
        </Field>
        <Field label="Terminal">
          {f.dep_terminal ?? "—"}
          {f.dep_gate && <span className="font-medium text-muted-foreground"> · Gate {f.dep_gate}</span>}
        </Field>
        <Field label="Seat">{f.seat ?? "—"}</Field>
        <Field label="Cabin">{f.cabin ?? "—"}</Field>
      </dl>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        {f.source === "auto" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {synced ? `Live status updated ${synced}. ` : "Live status. "}Seat and confirmation come from you.
          </>
        ) : (
          "Added by hand. Close to the flight, Lifolio looks it up and fills in the live details."
        )}
      </p>
    </div>
  );
}
