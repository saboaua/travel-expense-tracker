/** Checking and fixing supermarket places by hand. Pure, so it is unit-tested. */
import { num, splitGps } from "@/lib/personal/supermarket-import";

export type PlaceFlag = "outside" | "same" | null;
export type PlaceRow = { id: string; name: string; address: string | null; lat: number; lng: number; fixed?: boolean | null };
export type PlaceView = PlaceRow & { fixed: boolean; flag: PlaceFlag; sameAs: string | null };
export type PlaceFilter = "all" | "fixed" | "outside" | "same";

/** Aruba with a little room around it. A shop outside this box is almost certainly a typo. */
export const ARUBA = { south: 12.35, north: 12.67, west: -70.12, east: -69.83 };
export const inAruba = (lat: number, lng: number) => lat >= ARUBA.south && lat <= ARUBA.north && lng >= ARUBA.west && lng <= ARUBA.east;

const pointKey = (lat: number, lng: number) => `${lat.toFixed(5)}|${lng.toFixed(5)}`;

/** Marks each place that sits outside Aruba, or on exactly the same point as a different shop. */
export function viewPlaces(rows: PlaceRow[]): PlaceView[] {
  const at = new Map<string, PlaceRow[]>();
  for (const r of rows) { const k = pointKey(r.lat, r.lng); at.set(k, [...(at.get(k) ?? []), r]); }
  return rows.map((r) => {
    const other = (at.get(pointKey(r.lat, r.lng)) ?? []).find((o) => o.id !== r.id);
    const flag: PlaceFlag = !inAruba(r.lat, r.lng) ? "outside" : other ? "same" : null;
    return { ...r, fixed: !!r.fixed, flag, sameAs: flag === "same" && other ? other.name : null };
  });
}

export function filterPlaces(list: PlaceView[], q: string, filter: PlaceFilter): PlaceView[] {
  const s = q.trim().toLowerCase();
  return list.filter((p) => (filter === "all" || (filter === "fixed" ? p.fixed : p.flag === filter)) && (!s || p.name.toLowerCase().includes(s) || (p.address ?? "").toLowerCase().includes(s)));
}

export const FILTERS: PlaceFilter[] = ["all", "fixed", "outside", "same"];
export const isFilter = (v: unknown): v is PlaceFilter => typeof v === "string" && (FILTERS as string[]).includes(v);

/** What the admin typed in the latitude and longitude boxes. Both numbers pasted together into either box are split. */
export function readPoint(latText: unknown, lngText: unknown): { lat: number; lng: number } | { error: string } {
  const blank = (v: unknown) => String(v ?? "").trim() === "";
  const both = blank(lngText) ? splitGps(latText) : blank(latText) ? splitGps(lngText) : null;
  const lat = both ? both.lat : num(latText), lng = both ? both.lng : num(lngText);
  if (lat == null || lng == null) return { error: "Latitude and longitude must be numbers, like 12.5186 and -70.0358." };
  if (Math.abs(lat) > 90) return { error: "Latitude must be between -90 and 90." };
  if (Math.abs(lng) > 180) return { error: "Longitude must be between -180 and 180." };
  if (lat === 0 && lng === 0) return { error: "0, 0 is not a shop. Move the pin to the shop." };
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** The body of a fix: name, address and point. */
export function readFix(body: unknown): { ok: true; name: string; address: string | null; lat: number; lng: number } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  if (!name) return { ok: false, error: "Give the shop a name." };
  if (name.length > 120) return { ok: false, error: "The name is too long (120 letters at most)." };
  const address = String(b.address ?? "").trim();
  if (address.length > 200) return { ok: false, error: "The address is too long (200 letters at most)." };
  const p = readPoint(b.lat, b.lng);
  if ("error" in p) return { ok: false, error: p.error };
  return { ok: true, name, address: address || null, lat: p.lat, lng: p.lng };
}
