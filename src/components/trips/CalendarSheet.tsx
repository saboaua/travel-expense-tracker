"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CalendarPlus, Check, CloudOff, MapPin, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REMINDERS,
  googleCalendarUrl,
  guessTarget,
  icsPath,
  longDateRange,
  markState,
  readPrefs,
  targetLabel,
  writeMark,
  writePrefs,
  type CalendarMark,
  type CalendarTarget,
  type CalendarTrip,
  type Reminder,
} from "@/lib/trip-calendar";

const TARGETS: CalendarTarget[] = ["apple", "google", "ics"];

/** "Add to calendar" for one trip. Bottom sheet on phones, centred dialog on larger screens. */
export function CalendarSheet({
  trip,
  mark,
  onClose,
  onAdded,
}: {
  trip: CalendarTrip;
  mark: CalendarMark | null;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [iPhone, setIPhone] = useState(false);
  const [target, setTarget] = useState<CalendarTarget>("apple");
  const [reminder, setReminder] = useState<Reminder>("1d");
  const [details, setDetails] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const prefs = readPrefs();
    const guess = guessTarget(navigator.userAgent, navigator.maxTouchPoints);
    setIPhone(/iPhone|iPod/.test(navigator.userAgent));
    setTarget(mark?.target ?? prefs.target ?? guess);
    setReminder(prefs.reminder);
    setDetails(prefs.details);
    setOnline(navigator.onLine);
    // Choices are read once when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const state = markState(trip, mark);
  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const month = start.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const label = targetLabel(target, iPhone);

  function add() {
    writePrefs({ reminder, details, target });
    const link = `${window.location.origin}/trips/${trip.id}`;
    if (target === "google") {
      window.open(googleCalendarUrl(trip, { details, link }), "_blank", "noopener");
    } else {
      // iPhone opens its own "Add to Calendar" screen for the file; elsewhere it downloads
      window.location.href = icsPath(trip.id, { reminder, details, download: target === "ics" });
    }
    writeMark(trip.id, {
      target,
      name: trip.name,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      at: new Date().toISOString(),
    });
    onAdded(target === "ics" ? "Calendar file downloaded" : state === "none" ? `Added to ${label}` : `Sent to ${label} again`);
    onClose();
  }

  function forget() {
    writeMark(trip.id, null);
    onClose();
  }

  const addedOn = mark ? new Date(mark.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  return (
    <div
      className="app-frame fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add to calendar"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92%] w-full max-w-md flex-col rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{state === "none" ? "Add to calendar" : "In your calendar"}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-1">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
            <div className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-lg bg-background shadow-sm" aria-hidden="true">
              <span className="text-[11px] font-bold tracking-wide text-red-600">{month}</span>
              <span className="text-xl font-bold leading-tight">{start.getUTCDate()}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{trip.name}</p>
              <p className="text-sm text-muted-foreground">{longDateRange(trip.start_date, trip.end_date)} · All day</p>
              {trip.destination && (
                <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {trip.destination}
                </p>
              )}
            </div>
          </div>

          {state !== "none" && mark && (
            <p className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", state === "changed" ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300")}>
              {state === "changed" ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                {state === "changed"
                  ? `This trip changed after you added it to ${targetLabel(mark.target, iPhone)} on ${addedOn}. Add it again to update the event.`
                  : `Added to ${targetLabel(mark.target, iPhone)} on ${addedOn}.`}{" "}
                <button type="button" onClick={forget} className="font-medium underline underline-offset-2">
                  Not in my calendar
                </button>
              </span>
            </p>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-muted-foreground">Remind me</legend>
            <div role="radiogroup" aria-label="Remind me" className="flex flex-wrap gap-2">
              {REMINDERS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={reminder === r.id}
                  onClick={() => setReminder(r.id)}
                  disabled={target === "google"}
                  className={cn(
                    "h-9 rounded-full border-[1.5px] px-3.5 text-sm transition-colors disabled:opacity-50",
                    reminder === r.id ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border font-medium hover:bg-muted"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {target === "google" ? "Google Calendar uses your own default reminders." : "Reminders go off at 9 AM."}
            </p>
          </fieldset>

          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-[15px] font-medium">Include trip details</span>
              <span className="block text-xs text-muted-foreground">Trip notes and a link back to the trip</span>
            </span>
            <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} className="peer sr-only" />
            <span
              aria-hidden="true"
              className={cn(
                "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                details ? "bg-emerald-500" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn("absolute top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow transition-all", details ? "left-[22px]" : "left-0.5")} />
            </span>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-muted-foreground">Add to</legend>
            <div role="radiogroup" aria-label="Add to" className="overflow-hidden rounded-xl border">
              {TARGETS.map((t, i) => {
                const on = target === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTarget(t)}
                    className={cn("flex min-h-14 w-full items-center gap-3 px-3.5 text-left transition-colors", i > 0 && "border-t", on ? "bg-primary/5" : "hover:bg-muted")}
                  >
                    <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2", on ? "border-primary" : "border-muted-foreground/40")}>
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px]", on ? "font-semibold" : "font-medium")}>{targetLabel(t, iPhone)}</span>
                      {t === "ics" && <span className="block text-xs text-muted-foreground">Downloads a calendar file (.ics)</span>}
                    </span>
                    {on && <Check className="h-5 w-5 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {!online && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" /> You are offline. Connect to add this trip to your calendar.
          </p>
        )}
        <button
          type="button"
          onClick={add}
          disabled={!online}
          className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
        >
          <CalendarPlus className="h-5 w-5" aria-hidden="true" />
          {state === "none" ? (target === "ics" ? "Download calendar file" : `Add to ${label}`) : state === "changed" ? `Update in ${label}` : `Add to ${label} again`}
        </button>
      </div>
    </div>
  );
}
