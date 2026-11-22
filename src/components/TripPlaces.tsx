"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { cityOf, distanceText, mapsUrl, placesTrips, type Place, type PlacesTrip } from "@/lib/trip-places";
import { formatDateRange } from "@/lib/utils";

type Data = { things: Place[]; eat: Place[]; attribution?: string };
type State = { status: "loading" } | { status: "ready"; data: Data } | { status: "none" };

const FIRST = 5; // rows shown before "Show all"

/**
 * Top 10 things to do and places to eat for the trip that is on now (otherwise the next one), as two tabs. 5 rows show first, "Show all 10" opens the rest.
 * Shown on both the Personal and the Business home. Hidden when there is no trip with a destination or nothing was found.
 */
export function TripPlaces({ trips, today }: { trips: PlacesTrip[]; today: string }) {
  const list = useMemo(() => placesTrips(trips, today), [trips, today]);
  const [pick, setPick] = useState<string | null>(null);
  const trip = list.find((t) => t.id === pick) ?? list[0] ?? null;
  const [tab, setTab] = useState<"things" | "eat">("things");
  const [all, setAll] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const dest = trip?.destination?.trim() ?? "";

  useEffect(() => {
    if (!dest) return;
    let off = false;
    setState({ status: "loading" });
    fetch(`/api/trip-places?dest=${encodeURIComponent(dest)}&trip=${encodeURIComponent(trip?.id ?? "")}&end=${trip?.end || trip?.start || ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Data) => { if (!off) setState(d.things?.length || d.eat?.length ? { status: "ready", data: d } : { status: "none" }); })
      .catch(() => { if (!off) setState({ status: "none" }); });
    return () => { off = true; };
  }, [dest, trip?.id, trip?.end, trip?.start]);

  if (!trip || state.status === "none") return null;
  const range = formatDateRange(trip.start as string, trip.end);
  const full = state.status === "ready" ? (tab === "things" ? state.data.things : state.data.eat) : [];
  const shown = all ? full : full.slice(0, FIRST);
  const sub = `${cityOf(dest)}, ${range}`;

  return (
    <Card className="space-y-3 p-4" data-testid="trip-places" aria-busy={state.status === "loading"}>
      <div className="flex items-center gap-2"><MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><h2 className="text-[17px] font-extrabold leading-tight">Around your trip</h2></div>
      {list.length > 1 ? (
        <label className="block text-[12.5px] font-semibold text-primary">
          <span className="sr-only">Show places for</span>
          <select value={trip.id} onChange={(e) => setPick(e.target.value)} className="min-h-9 max-w-full rounded-lg bg-transparent pr-2 font-semibold" data-testid="trip-places-pick">
            {list.map((t) => <option key={t.id} value={t.id}>{`${cityOf(t.destination ?? "")}, ${formatDateRange(t.start as string, t.end)}`}</option>)}
          </select>
        </label>
      ) : <p className="-mt-1.5 text-[12.5px] text-muted-foreground" data-testid="trip-places-sub">{sub}</p>}
      <Tabs label="Places" size="md" fullWidth value={tab} onChange={(v) => { setTab(v as "things" | "eat"); setAll(false); }} idPrefix="places-tab" options={[{ id: "things", label: "Things to do" }, { id: "eat", label: "Where to eat" }]} />
      {state.status === "loading" ? (
        <div className="space-y-3" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-3/5 animate-pulse rounded bg-muted" /><div className="h-3 w-2/5 animate-pulse rounded bg-muted" /></div></div>)}</div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="trip-places-empty">Nothing found here yet.</p>
      ) : (
        <>
          <ul className="divide-y" data-testid="trip-places-list" aria-label={tab === "things" ? "Things to do" : "Where to eat"}>
            {shown.map((p, i) => (
              <li key={p.id}>
                <a href={mapsUrl({ name: `${p.name} ${cityOf(dest)}`, lat: p.lat, lng: p.lng })} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="trip-place">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-[12.5px] font-extrabold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{i + 1}</span>
                  <span className="min-w-0 flex-1"><b className="block truncate text-[15px] font-bold">{p.name}</b><span className="text-[12.5px] text-muted-foreground">{p.type} · {distanceText(p.km)}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          {full.length > FIRST && (
            <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="flex min-h-11 w-full items-center justify-center gap-1 border-t text-sm font-bold text-primary" data-testid="trip-places-more">
              {all ? "Show fewer" : `Show all ${full.length}`}{all ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </>
      )}
      {state.status === "ready" && <p className="text-[11.5px] text-muted-foreground">Tap a place to open it in Maps. {state.data.attribution ?? "© OpenStreetMap contributors"}</p>}
    </Card>
  );
}
