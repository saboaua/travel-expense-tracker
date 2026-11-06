/**
 * Where does a scanned or uploaded receipt go? Pure functions, so the rules can be tested without a browser.
 *
 * Scan (camera): your current place decides. Upload (gallery or files): the date on the photo decides, because you
 * are often uploading later, from a different place than where the receipt was paid.
 */

export type ScanOption = {
  /** "trip:<id>", "project:<id>", "ptrip:<id>", "grocery" or "document" */
  key: string;
  kind: "trip" | "project" | "ptrip" | "grocery" | "document";
  id?: string;
  label: string;
  sub: string;
  /** Page that takes the receipt */
  href: string;
  destination?: string | null;
  start?: string | null;
  end?: string | null;
};

export type Place = { city: string | null; countryCode: string | null };
export type HomePlace = { city?: string | null; country?: string | null };

export type Suggestion = {
  pick: ScanOption | null;
  /** true: go straight to the form (with a Change button). false: show the sheet with the pick selected. */
  confident: boolean;
  /** Short line under the choice, e.g. "You're in Miami" */
  reason: string | null;
};

const norm = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** English name for a two-letter country code, e.g. "AW" -> "Aruba". */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

const hasWord = (haystack: string, needle: string) => needle.length >= 3 && ` ${haystack} `.includes(` ${needle} `);

/** Does a trip's destination ("Miami, Florida, USA") describe the place the person is standing in? */
export function destinationMatches(destination: string | null | undefined, place: Place | null): boolean {
  const d = norm(destination);
  if (!d || !place) return false;
  const city = norm(place.city);
  if (city && hasWord(d, city)) return true;
  // No city in the destination text: fall back to the country, but only when the destination names no other city
  const country = norm(countryName(place.countryCode));
  return !!country && d === country;
}

export function isHome(place: Place | null, home: HomePlace | null | undefined): boolean {
  if (!place || !home) return false;
  const hc = norm(home.city);
  const hn = norm(home.country);
  if (!hc && !hn) return false;
  const pc = norm(place.city);
  const pn = norm(countryName(place.countryCode));
  if (hc && pc && (hc === pc || hasWord(pc, hc) || hasWord(hc, pc))) return !hn || !pn || hn === pn;
  if (!hc && hn && pn) return hn === pn;
  return false;
}

const covers = (o: ScanOption, date: string) => !!o.start && o.start <= date && date <= (o.end || o.start);

export type SuggestInput = {
  mode: "scan" | "upload";
  options: ScanOption[];
  /** Where the person is now (scan only; null when blocked or unknown) */
  place?: Place | null;
  home?: HomePlace | null;
  /** Date of the photo, YYYY-MM-DD (upload only) */
  photoDate?: string | null;
  today: string;
  /** Key of the choice made last time */
  last?: string | null;
  /** The upload looks like a passport or ID */
  looksLikeId?: boolean;
};

export function suggestDestination(i: SuggestInput): Suggestion {
  const byKey = (k: string | null | undefined) => (k ? i.options.find((o) => o.key === k) ?? null : null);
  const trips = i.options.filter((o) => o.kind === "trip");
  const personal = i.options.filter((o) => o.kind === "project" || o.kind === "ptrip");
  const grocery = byKey("grocery");
  const doc = byKey("document");
  const last = byKey(i.last);
  const firstCovering = (list: ScanOption[], d: string) => list.find((o) => covers(o, d)) ?? null;

  if (i.looksLikeId && doc) return { pick: doc, confident: false, reason: "Looks like a passport or ID" };

  if (i.mode === "upload") {
    const d = i.photoDate || null;
    if (d) {
      const hits = trips.filter((o) => covers(o, d));
      if (hits.length === 1) return { pick: hits[0], confident: true, reason: `Photo taken during ${hits[0].label}` };
      if (hits.length > 1) return { pick: hits[0], confident: false, reason: "Several trips were on that day" };
    }
    const fallback = last ?? (trips.length === 1 && personal.length === 0 && !grocery ? trips[0] : null) ?? grocery ?? trips[0] ?? personal[0] ?? null;
    return { pick: fallback, confident: false, reason: last ? "Same as last time" : null };
  }

  // scan
  const place = i.place ?? null;
  if (place) {
    const hits = trips.filter((o) => destinationMatches(o.destination, place));
    const city = place.city || countryName(place.countryCode) || "this place";
    if (hits.length === 1) return { pick: hits[0], confident: true, reason: `You're in ${city}` };
    if (hits.length > 1) {
      const now = firstCovering(hits, i.today) ?? hits[0];
      return { pick: now, confident: false, reason: `Several trips are in ${city}` };
    }
    if (isHome(place, i.home) && (grocery || personal.length)) {
      const pick = last && last.kind !== "trip" && last.kind !== "document" ? last : grocery ?? personal[0];
      return { pick, confident: false, reason: `You're home in ${city}` };
    }
  }
  if (trips.length === 1 && !grocery && personal.length === 0) return { pick: trips[0], confident: true, reason: null };
  if (!place && trips.length === 1 && trips.every((o) => covers(o, i.today))) return { pick: trips[0], confident: true, reason: null };
  const pick = last ?? firstCovering(trips, i.today) ?? trips[0] ?? grocery ?? personal[0] ?? null;
  return { pick, confident: false, reason: last ? "Same as last time" : null };
}

/** Builds the list of places a receipt can go from what the person has and may use. */
export function buildScanOptions(input: {
  trips: { id: string; name: string; destination: string | null; start_date: string; end_date: string | null; range?: string }[];
  projects: { id: string; kind: string; name: string; destination: string | null; start_date: string | null; end_date: string | null; status?: string | null }[];
  canTrips: boolean;
  canPersonal: boolean;
  canDocuments: boolean;
}): ScanOption[] {
  const out: ScanOption[] = [];
  if (input.canTrips) {
    for (const t of input.trips) {
      out.push({ key: `trip:${t.id}`, kind: "trip", id: t.id, label: t.name, sub: ["Business", t.destination, t.range].filter(Boolean).join(" · "), href: `/trips/${t.id}/add-expense`, destination: t.destination, start: t.start_date, end: t.end_date });
    }
  }
  if (input.canPersonal) {
    out.push({ key: "grocery", kind: "grocery", label: "Groceries", sub: "Supermarket receipt", href: "/personal/groceries/new" });
    for (const p of input.projects) {
      if ((p.status || "active") !== "active") continue;
      if (p.kind === "home_project") out.push({ key: `project:${p.id}`, kind: "project", id: p.id, label: p.name, sub: "Home project", href: `/personal/projects/${p.id}/expense`, destination: p.destination, start: p.start_date, end: p.end_date });
      else if (p.kind === "personal_trip") out.push({ key: `ptrip:${p.id}`, kind: "ptrip", id: p.id, label: p.name, sub: ["Personal travel", p.destination].filter(Boolean).join(" · "), href: `/personal/travel/${p.id}/expense`, destination: p.destination, start: p.start_date, end: p.end_date });
    }
  }
  if (input.canDocuments) out.push({ key: "document", kind: "document", label: "Document", sub: "Passport, ID, driver's license…", href: "/documents" });
  return out;
}
