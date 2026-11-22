/**
 * Top things to do and places to eat around a trip's destination, from OpenStreetMap (open data). Pure rules: the map queries,
 * the ranking, the trip that is shown and the map link, so they are unit-tested. OpenStreetMap has no ratings, so places are
 * ranked by how well documented they are (Wikipedia, website, opening hours) and then by distance from the centre.
 */
export type PlaceKind = "things" | "eat";
export type Place = { id: string; name: string; type: string; km: number; lat: number; lng: number };
export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export const TOP = 10;
export const RADIUS_M = 7000;

export function overpassQuery(kind: PlaceKind, c: { lat: number; lon: number }, radius = RADIUS_M): string {
  const a = `(around:${radius},${c.lat},${c.lon})`;
  const body = kind === "things"
    ? `nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"]${a};nwr["historic"~"^(castle|monument|memorial|ruins|archaeological_site|fort|church|cathedral)$"]["name"]${a};nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"]${a};`
    : `nwr["amenity"~"^(restaurant|cafe|bar|pub|food_court|ice_cream)$"]["name"]${a};`;
  return `[out:json][timeout:25];(${body});out center 300;`;
}

const LABEL: Record<string, string> = {
  attraction: "Attraction", museum: "Museum", viewpoint: "Viewpoint", gallery: "Gallery", zoo: "Zoo", theme_park: "Theme park", aquarium: "Aquarium",
  castle: "Castle", monument: "Monument", memorial: "Memorial", ruins: "Ruins", archaeological_site: "Ruins", fort: "Fort", church: "Church", cathedral: "Cathedral",
  park: "Park", garden: "Garden", restaurant: "Restaurant", cafe: "Cafe", bar: "Bar", pub: "Pub", food_court: "Food hall", ice_cream: "Ice cream",
};
const title = (s: string) => s.replace(/[_;]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "Seafood" for a restaurant with a cuisine, otherwise the plain kind of place. */
export function placeType(tags: Record<string, string>): string {
  const base = tags.tourism && LABEL[tags.tourism] ? tags.tourism : tags.historic && LABEL[tags.historic] ? tags.historic : tags.amenity && LABEL[tags.amenity] ? tags.amenity : tags.leisure && LABEL[tags.leisure] ? tags.leisure : "";
  if (tags.amenity === "restaurant" && tags.cuisine) return title(tags.cuisine.split(";")[0].trim()).slice(0, 24);
  return LABEL[base] ?? "Place";
}

const rad = (d: number) => (d * Math.PI) / 180;
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** How much is known about a place. More means better known, and so a better pick for a visitor. */
export function prominence(kind: PlaceKind, t: Record<string, string>): number {
  let s = 0;
  if (t.wikipedia) s += 4;
  if (t.wikidata) s += 3;
  if (t.website || t["contact:website"]) s += 1;
  if (t.opening_hours) s += 1;
  if (t.image || t.wikimedia_commons) s += 1;
  if (kind === "things") {
    if (t.tourism === "attraction" || t.tourism === "museum" || t.historic) s += 1;
    if (t.heritage) s += 1;
  } else {
    if (t.cuisine) s += 1;
    if (t["addr:street"]) s += 0.5;
    if (t.brand || t["brand:wikidata"]) s -= 3; // a chain is not what a visitor looks for
    if (t.amenity === "fast_food") s -= 3;
  }
  return s;
}

/** The best `limit` places: highest prominence first, then the closest. A name that appears twice counts once. */
export function rankPlaces(kind: PlaceKind, els: OsmElement[], c: { lat: number; lon: number }, limit = TOP): Place[] {
  const seen = new Set<string>();
  const list = els.flatMap((e) => {
    const t = e.tags ?? {}, name = (t.name || "").replace(/\s+/g, " ").trim();
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    if (!name || lat == null || lng == null) return [];
    const key = name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ place: { id: `${e.type}/${e.id}`, name: name.slice(0, 80), type: placeType(t), km: Math.round(kmBetween(c, { lat, lon: lng }) * 10) / 10, lat, lng }, score: prominence(kind, t) }];
  });
  return list.sort((a, b) => b.score - a.score || a.place.km - b.place.km).slice(0, limit).map((x) => x.place);
}

export const distanceText = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`);

/** Opens the place in the phone's map app (a normal link, no map key needed). */
export const mapsUrl = (p: { name: string; lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}`)}%20${p.lat},${p.lng}`;

export type PlacesTrip = { id: string; name: string; destination: string | null; start: string | null; end: string | null };

/** Trips that can show places: they need a destination and must not be over. Ongoing first, then the soonest upcoming. */
export function placesTrips(trips: PlacesTrip[], today: string): PlacesTrip[] {
  const ok = trips.filter((t) => t.destination?.trim() && t.start && (t.end || t.start) >= today);
  const ongoing = ok.filter((t) => (t.start as string) <= today).sort((a, b) => (a.start as string).localeCompare(b.start as string));
  const upcoming = ok.filter((t) => (t.start as string) > today).sort((a, b) => (a.start as string).localeCompare(b.start as string));
  return [...ongoing, ...upcoming];
}

/** "Lisbon" from "Lisbon, Portugal"; the whole text when there is no comma. */
export const cityOf = (destination: string) => destination.split(",")[0].trim() || destination.trim();
