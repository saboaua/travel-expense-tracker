"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Plane, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { applyRows, deleteRow, makeRowApi, waitingRowIds } from "@/lib/row-outbox";
import { browserOutbox, SYNCED_EVENT } from "@/lib/outbox";
import { useOutbox } from "@/lib/use-outbox";
import { needsRefresh, nextFlight, sortFlights, type TripFlight } from "@/lib/flights";
import { FlightPanel } from "./FlightPanel";
import { AddFlightSheet } from "./AddFlightSheet";
import { FlightCalendarSheet } from "./FlightCalendarSheet";

const LEG_LABEL = { outbound: "Outbound", return: "Return", connection: "Connection" } as const;
const ghost = "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The "Flights" section of a trip: the flight panel, tabs when there is more than one, and adding, editing and removing. */
export function TripFlights({
  tripId, tripName, tripStart, tripEnd, userId, flights: initial,
}: {
  tripId: string;
  tripName: string;
  tripStart: string;
  tripEnd: string;
  userId: string;
  flights: TripFlight[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { items } = useOutbox(userId);
  const [fresh, setFresh] = useState<Record<string, TripFlight>>({});
  const [sheet, setSheet] = useState<{ existing?: TripFlight; leg?: TripFlight["leg"] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [cal, setCal] = useState<TripFlight | null>(null);
  const [added, setAdded] = useState("");
  const asked = useRef(false);

  // Waiting changes that reach the server later bring the page up to date
  useEffect(() => {
    const again = () => router.refresh();
    window.addEventListener(SYNCED_EVENT, again);
    return () => window.removeEventListener(SYNCED_EVENT, again);
  }, [router]);

  // New props from the server replace anything refreshed earlier
  useEffect(() => setFresh({}), [initial]);

  const merged = useMemo(() => {
    const base = initial.map((f) => fresh[f.id] ?? f);
    return sortFlights(applyRows(base, items, "trip_flights", (r) => r.trip_id === tripId));
  }, [initial, fresh, items, tripId]);
  const waiting = useMemo(() => waitingRowIds(items, "trip_flights"), [items]);
  const tripWaiting = useMemo(() => items.some((i) => i.id === tripId), [items, tripId]);

  // Opening the trip refreshes flights that are about to leave (the daily job alone is too slow for gate changes)
  useEffect(() => {
    if (asked.current) return;
    if (!initial.some((f) => needsRefresh(f, Date.now()))) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    asked.current = true;
    fetch("/api/flights/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { flights?: TripFlight[] } | null) => {
        if (b?.flights?.length) setFresh(Object.fromEntries(b.flights.map((f) => [f.id, f])));
      })
      .catch(() => {});
  }, [initial, tripId]);

  const current = merged.find((f) => f.id === picked) ?? nextFlight(merged, Date.now()) ?? merged[0] ?? null;

  async function remove(f: TripFlight) {
    const ok = await confirm({ title: "Remove this flight?", message: `${f.flight_number} will be removed from this trip. Your expenses are not affected.`, confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    setErr("");
    try {
      await deleteRow({
        api: makeRowApi(createClient()), store: browserOutbox, userId, table: "trip_flights", id: f.id,
        waiting: (await browserOutbox.list().catch(() => [])).find((i) => i.id === f.id) ?? null,
        label: "Flight removed", summary: `Flight · ${f.flight_number}`,
      });
      setPicked(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove the flight.");
    }
  }

  const missingLeg = merged.length === 1 ? (merged[0].leg === "outbound" ? "return" : "outbound") : undefined;

  return (
    <section id="flights" aria-labelledby="flights-h" className="scroll-mt-20 rounded-xl border bg-card p-3 shadow-sm md:p-4" data-testid="trip-flights">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="flights-h" className="flex items-center gap-2 text-lg font-bold"><Plane className="h-5 w-5 text-primary" aria-hidden="true" />Flights</h2>
        {merged.length > 0 && (
          <button type="button" data-testid="flight-add" onClick={() => setSheet({ leg: missingLeg })} className={cn(ghost, "text-primary")}>
            <Plus className="h-4 w-4" aria-hidden="true" />Add flight
          </button>
        )}
      </div>

      {merged.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-center">
          <p className="font-semibold">No flight added yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add your flight number and we fill in the times, terminal and gate, then keep them up to date.</p>
          <button type="button" data-testid="flight-add" onClick={() => setSheet({})} className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" aria-hidden="true" />Add your flight
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {merged.length > 1 && (
            <div role="tablist" aria-label="Flights" className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1">
              {merged.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  type="button"
                  aria-selected={current?.id === f.id}
                  onClick={() => setPicked(f.id)}
                  className={cn("min-h-11 shrink-0 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", current?.id === f.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {LEG_LABEL[f.leg]} · {f.flight_number}
                </button>
              ))}
            </div>
          )}
          {current && (
            <div role={merged.length > 1 ? "tabpanel" : undefined}>
              <FlightPanel flight={current} />
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button type="button" data-testid="flight-calendar" disabled={waiting.has(current.id)} title={waiting.has(current.id) ? "Available once the flight has synced" : undefined} onClick={() => setCal(current)} className={cn(ghost, "disabled:opacity-50")}><CalendarPlus className="h-4 w-4" aria-hidden="true" />Add to calendar</button>
                <button type="button" data-testid="flight-edit" onClick={() => setSheet({ existing: current })} className={ghost}><Pencil className="h-4 w-4" aria-hidden="true" />Edit</button>
                <button type="button" data-testid="flight-remove" onClick={() => remove(current)} className={cn(ghost, "text-red-700 dark:text-red-300")}><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</button>
                {waiting.has(current.id) && <span className="ml-auto text-xs font-medium text-amber-800 dark:text-amber-200" data-testid="flight-waiting">Waiting to sync</span>}
              </div>
            </div>
          )}
        </div>
      )}
      {added && <p role="status" data-testid="flight-cal-done" className="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">{added}</p>}
      {err && <p role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{err}</p>}

      {cal && <FlightCalendarSheet flight={cal} onClose={() => setCal(null)} onAdded={setAdded} />}
      {sheet && (
        <AddFlightSheet
          key={sheet.existing?.id ?? "new"}
          tripId={tripId} tripName={tripName} tripStart={tripStart} tripEnd={tripEnd} userId={userId}
          existing={sheet.existing} defaultLeg={sheet.leg} tripWaiting={tripWaiting}
          onClose={() => setSheet(null)} onSaved={() => { setPicked(null); router.refresh(); }}
        />
      )}
    </section>
  );
}
