"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Plane, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { guessTarget, targetLabel, type CalendarTarget } from "@/lib/trip-calendar";
import { FLIGHT_REMINDERS, flightIcsPath, flightTimes, flightTitle, googleFlightUrl, isFlightReminder, type CalendarFlight, type FlightReminder } from "@/lib/flight-calendar";
import { clock, shownArrival, shownDeparture } from "@/lib/flights";

const PREFS = "flight-calendar:prefs";
const TARGETS: CalendarTarget[] = ["apple", "google", "ics"];

const day = (local: string | null) =>
  local ? new Date(`${local.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
const time = (local: string | null) => { const c = clock(local); return c ? `${c.time} ${c.period}` : ""; };

/** Add one flight to the phone's calendar: Apple / Google / file, with a reminder. Works for your own flights and for a partner's shared ones. */
export function FlightCalendarSheet({ flight, onClose, onAdded }: { flight: CalendarFlight; onClose: () => void; onAdded: (message: string) => void }) {
  const [iPhone, setIPhone] = useState(false);
  const [target, setTarget] = useState<CalendarTarget>("apple");
  const [reminder, setReminder] = useState<FlightReminder>("3h");

  useEffect(() => {
    let saved: { target?: unknown; reminder?: unknown } = {};
    try { saved = JSON.parse(localStorage.getItem(PREFS) || "{}") ?? {}; } catch { /* storage can be off */ }
    setIPhone(/iPhone|iPod/.test(navigator.userAgent));
    setTarget(TARGETS.includes(saved.target as CalendarTarget) ? (saved.target as CalendarTarget) : guessTarget(navigator.userAgent, navigator.maxTouchPoints));
    if (isFlightReminder(saved.reminder)) setReminder(saved.reminder);
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const dep = shownDeparture(flight);
  const arr = shownArrival(flight);
  const times = flightTimes(flight);
  const label = targetLabel(target, iPhone);

  function add() {
    try { localStorage.setItem(PREFS, JSON.stringify({ target, reminder })); } catch { /* ignore */ }
    if (target === "google") {
      const url = googleFlightUrl(flight, `${window.location.origin}/trips`);
      if (url) window.open(url, "_blank", "noopener");
    } else {
      // iPhone opens its own "Add to Calendar" screen for the file; elsewhere it downloads
      window.location.href = flightIcsPath(flight.id, { reminder, download: target === "ics" });
    }
    onAdded(target === "ics" ? "Calendar file downloaded" : `Sent to ${label}`);
    onClose();
  }

  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add flight to calendar" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92%] w-full max-w-md flex-col rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-muted sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Add flight to calendar</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Close"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-1">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3" data-testid="flight-cal-preview">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-sm" aria-hidden="true"><Plane className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{flightTitle(flight)}</p>
              <p className="text-sm text-muted-foreground">{[day(dep), time(dep) && `${time(dep)} to ${time(arr)}`].filter(Boolean).join(" · ")}</p>
              <p className="text-[13px] text-muted-foreground">{times?.fixed ? "Times are local to each airport" : "Shown in your phone's own time zone"}</p>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Calendar</legend>
            <div role="group" aria-label="Calendar" className="flex gap-1 rounded-2xl bg-muted p-1">
              {TARGETS.map((t) => (
                <button key={t} type="button" aria-pressed={target === t} onClick={() => setTarget(t)} className={cn("min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", target === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t === "apple" ? (iPhone ? "iPhone" : "Apple") : t === "google" ? "Google" : "Outlook / file"}
                </button>
              ))}
            </div>
          </fieldset>

          {target !== "google" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Reminder</span>
              <select data-testid="flight-cal-reminder" value={reminder} onChange={(e) => setReminder(e.target.value as FlightReminder)} className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {FLIGHT_REMINDERS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
          )}
          {target === "google" && <p className="text-[13px] text-muted-foreground">Google Calendar applies your own default reminders.</p>}
          <p className="text-[13px] text-muted-foreground">The event keeps the time it has now. If the airline changes it, add it again to update the calendar.</p>
        </div>

        <button type="button" data-testid="flight-cal-add" onClick={add} disabled={!times} className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <CalendarPlus className="h-5 w-5" aria-hidden="true" />Add to {label}
        </button>
      </div>
    </div>
  );
}
