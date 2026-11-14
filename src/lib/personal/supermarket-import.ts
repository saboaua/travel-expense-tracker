/** Reads the admin's list of supermarket places (name, latitude, longitude, optional address). Pure, so it is unit-tested. */

export type PlaceRow = { name: string; name_key: string; address: string | null; lat: number; lng: number };
export type PlaceParse = { rows: PlaceRow[]; total: number; skipped: { noName: number; badGps: number; duplicate: number; example: number } };

const HEAD = {
  name: ["name", "store", "supermarket", "store name"],
  lat: ["latitude", "lat"],
  lng: ["longitude", "lng", "lon", "long"],
  both: ["gps", "location", "coordinates", "coordinate", "latlng", "lat lng", "lat, lng"],
  address: ["address", "street", "area", "notes"],
};
const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

/** Which of the file's columns is which, or what is missing. */
export function mapHeaders(head: unknown[]): { name?: number; lat?: number; lng?: number; both?: number; address?: number; missing: string[] } {
  const find = (names: string[]) => { const i = head.findIndex((h) => names.includes(norm(h))); return i < 0 ? undefined : i; };
  const m = { name: find(HEAD.name), lat: find(HEAD.lat), lng: find(HEAD.lng), both: find(HEAD.both), address: find(HEAD.address) };
  const missing: string[] = [];
  if (m.name == null) missing.push("Name");
  if (m.both == null && (m.lat == null || m.lng == null)) missing.push("Latitude and Longitude (or one GPS column)");
  return { ...m, missing };
}

/** "12.5186" or "12,5186" as a number; null when it is not one. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/[°\s]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** "12.5186, -70.0358" (the way a map shows a point) as latitude and longitude. */
export function splitGps(v: unknown): { lat: number; lng: number } | null {
  const m = String(v ?? "").trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = num(m[1]), lng = num(m[2]);
  return lat != null && lng != null ? { lat, lng } : null;
}

export const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

/** Rows after the header. A name that starts with EXAMPLE is the template's sample and is never imported. */
export function parsePlaces(head: unknown[], body: unknown[][]): PlaceParse | { error: string } {
  const m = mapHeaders(head);
  if (m.missing.length) return { error: `Missing column: ${m.missing.join(", ")}. Download the example file to see the layout.` };
  const out: PlaceRow[] = [];
  const seen = new Set<string>();
  const skipped = { noName: 0, badGps: 0, duplicate: 0, example: 0 };
  let total = 0;
  for (const r of body) {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    total++;
    const name = String(r[m.name!] ?? "").trim().slice(0, 120);
    if (!name) { skipped.noName++; continue; }
    if (/^example\b/i.test(name)) { skipped.example++; continue; }
    const g = m.both != null && m.lat == null ? splitGps(r[m.both]) : { lat: num(r[m.lat!]), lng: num(r[m.lng!]) };
    if (!g || g.lat == null || g.lng == null || Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180 || (g.lat === 0 && g.lng === 0)) { skipped.badGps++; continue; }
    const key = `${nameKey(name)}|${g.lat.toFixed(5)}|${g.lng.toFixed(5)}`;
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);
    out.push({ name, name_key: nameKey(name), address: m.address != null ? String(r[m.address] ?? "").trim().slice(0, 200) || null : null, lat: Math.round(g.lat * 1e6) / 1e6, lng: Math.round(g.lng * 1e6) / 1e6 });
  }
  return { rows: out, total, skipped };
}
