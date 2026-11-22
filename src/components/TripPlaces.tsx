"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { cityOf, distanceText, mapsUrl, placesTrips, type Place, type PlacesTrip } from "@/lib/trip-places";
import { formatDateRange } from "@/lib/utils";

type Data = { things: Place[]; eat: Place[]; attribution?: string };
type State = { status: "loading" } | { status: "ready"; data: Data } | { status: "none" };

const TONES = ["bg-blue-100 dark:bg-blue-950", "bg-amber-100 dark:bg-amber-950", "bg-emerald-100 dark:bg-emerald-950", "bg-rose-100 dark:bg-rose-950", "bg-violet-100 dark:bg-violet-950", "bg-sky-100 dark:bg-sky-950"];

/**
 * Top 10 things to do and places to eat for the trip that is on now (otherwise the next one), as two tabs of swipe tiles.
 * Shown on both the Personal and the Business home. Hidden when there is no trip with a destination or nothing was found.
 */
export function TripPlaces({ trips, today }: { trips: PlacesTrip[]; today: string }) {
  const list = useMemo(() => placesTrips(trips, today), [trips, today]);
  const [pick, setPick] = useState<string | null>(null);
  const trip = list.find((t) => t.id === pick) ?? list[0] ?? null;
  const [tab, setTab] = useState<"things" | "eat">("things");
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
  const shown = state.status === "ready" ? (tab === "things" ? state.data.things : state.data.eat) : [];
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
      <Tabs label="Places" size="md" fullWidth value={tab} onChange={(v) => setTab(v as "things" | "eat")} idPrefix="places-tab" options={[{ id: "things", label: "Things to do" }, { id: "eat", label: "Where to eat" }]} />
      {state.status === "loading" ? (
        <div className="flex gap-2.5 overflow-hidden" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="h-[170px] w-[150px] shrink-0 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="trip-places-empty">Nothing found here yet.</p>
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1" data-testid="trip-places-list" aria-label={tab === "things" ? "Things to do" : "Where to eat"}>
          {shown.map((p, i) => (
            <li key={p.id} className="w-[150px] shrink-0 snap-start">
              <a href={mapsUrl({ name: `${p.name} ${cityOf(dest)}`, lat: p.lat, lng: p.lng })} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="trip-place">
                <div className={`flex h-[72px] items-start p-2 ${TONES[i % TONES.length]}`}><span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-extrabold text-slate-900">{i + 1}</span></div>
                <div className="p-2.5">
                  <p className="line-clamp-2 min-h-[35px] text-sm font-bold leading-tight">{p.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.type}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground/70">{distanceText(p.km)} from the centre</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
      {state.status === "ready" && <p className="text-[11.5px] text-muted-foreground">Tap a place to open it in Maps. {state.data.attribution ?? "© OpenStreetMap contributors"}</p>}
    </Card>
  );
}
