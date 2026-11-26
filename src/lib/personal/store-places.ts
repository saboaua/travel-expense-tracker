import { distanceKm, sameStore, type LatLng } from "@/lib/personal/basket";

/** A known place for a store: one of your saved places, or a supermarket from the shared directory. */
export type PlaceLoc = {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  /** where it came from: your own pin, open map data, typed in, or the shared directory */
  source: "pin" | "osm" | "manual" | "directory";
  /** checked by an admin */
  fixed?: boolean;
  /** the one you chose for this store */
  preferred?: boolean;
};

export type PlaceOption = PlaceLoc & { km: number | null; chosen: boolean };

/** Places closer than this are the same shop listed twice. */
export const MERGE_M = 150;

// who wins when two copies are the same shop: your choice, then a checked place, then your pin, then map data
const rank = (p: PlaceLoc) => (p.preferred ? 0 : p.fixed ? 1 : p.source === "pin" || p.source === "manual" ? 2 : p.source === "directory" ? 3 : 4);

/** The places that could be this store: copies under 150 m apart merged (best one kept), nearest first. */
export function placeOptions(store: string, locs: PlaceLoc[], origin: LatLng | null): PlaceOption[] {
  const mine = locs.filter((l) => sameStore(l.name, store)).sort((a, b) => rank(a) - rank(b));
  const kept: PlaceLoc[] = [];
  for (const l of mine) if (!kept.some((k) => distanceKm(k, l) * 1000 < MERGE_M)) kept.push(l);
  const out = kept.map((p) => ({ ...p, km: origin ? distanceKm(origin, p) : null, chosen: false }));
  out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || rank(a) - rank(b));
  const pick = pickPlace(out);
  if (pick) pick.chosen = true;
  return out;
}

/** Your choice first, then a checked place, then the nearest. */
export function pickPlace<T extends PlaceOption>(options: T[]): T | null {
  if (!options.length) return null;
  const chosen = options.find((o) => o.preferred);
  if (chosen) return chosen;
  const fixed = options.filter((o) => o.fixed);
  const pool = fixed.length ? fixed : options;
  return [...pool].sort((a, b) => (a.km ?? 0) - (b.km ?? 0))[0];
}

/** The place used for each store. */
export function chosenPlaces(stores: string[], locs: PlaceLoc[], origin: LatLng | null): Map<string, LatLng> {
  const m = new Map<string, LatLng>();
  for (const s of stores) {
    const p = placeOptions(s, locs, origin).find((o) => o.chosen);
    if (p) m.set(s, { lat: p.lat, lng: p.lng });
  }
  return m;
}
