/**
 * Dutch travel advice (Ministerie van Buitenlandse Zaken) for a trip destination.
 * Source: Nederland Wereldwijd open data (CC0). The parsing is defensive on purpose: the colour code
 * is not a separate field in the API, it is written in the introduction text.
 */

export type AdvisoryLevel = "green" | "yellow" | "orange" | "red" | "unknown";

export type AdvisoryListItem = {
  location: string;
  locationkey?: string;
  isocode?: string;
  introduction?: string;
  dataurl?: string;
  canonical?: string;
  lastmodified?: string;
};

export type Advisory =
  | {
      status: "found";
      country: string;
      level: AdvisoryLevel;
      /** Some parts of the country have a different colour than the headline. */
      regional: boolean;
      points: string[];
      entry: string | null;
      updated: string | null;
      url: string;
    }
  | { status: "not_found"; url: string }
  | { status: "unavailable"; url: string };

export const ADVICE_HOME = "https://www.nederlandwereldwijd.nl/reisadvies";
export const API_BASE = "https://opendata.nederlandwereldwijd.nl/v2/sources/nederlandwereldwijd/infotypes";

const COLOUR_WORDS: Record<string, AdvisoryLevel> = { groen: "green", geel: "yellow", oranje: "orange", rood: "red" };
const SEVERITY: Record<AdvisoryLevel, number> = { unknown: 0, green: 1, yellow: 2, orange: 3, red: 4 };

export const LEVEL_META: Record<AdvisoryLevel, { label: string; meaning: string }> = {
  green: { label: "Green", meaning: "Travel is possible; normal precautions." },
  yellow: { label: "Yellow", meaning: "Be careful: there are specific safety risks." },
  orange: { label: "Orange", meaning: "Only travel if necessary." },
  red: { label: "Red", meaning: "Do not travel." },
  unknown: { label: "Check advice", meaning: "Open the full advice for the current level." },
};

/** Lower-case, no accents, letters and digits only. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,;:\s]+$/, "")}…`;
}

function colourOf(word: string): AdvisoryLevel {
  return word.startsWith("groen") ? "green" : word.startsWith("ge") ? "yellow" : word.startsWith("rod") || word === "rood" ? "red" : "orange";
}

/** Colour code from the advice introduction. Returns the headline level and whether other colours are mentioned. */
export function parseColour(introduction: string | null | undefined): { level: AdvisoryLevel; regional: boolean } {
  const text = stripHtml(introduction || "").toLowerCase();
  if (!text) return { level: "unknown", regional: false };

  const found = new Set<AdvisoryLevel>();
  for (const m of text.matchAll(/\b(groene?|gele?|geel|oranje|rode?|rood)\s+kleurcode/g)) found.add(colourOf(m[1]));
  for (const m of text.matchAll(/kleurcode[^.]{0,80}?\b(?:is|zijn|:)\s+(groen|geel|oranje|rood)/g)) found.add(colourOf(m[1]));

  // Headline: the sentence "De kleurcode van het reisadvies voor X is groen"
  const headline = text.match(/kleurcode van (?:het )?reisadvies[^.]{0,80}?\bis\s+(groen|geel|oranje|rood)/);
  const levels = [...found];
  if (headline) return { level: colourOf(headline[1]), regional: levels.some((l) => l !== colourOf(headline[1])) };
  if (levels.length === 0) return { level: "unknown", regional: false };
  const worst = levels.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
  return { level: worst, regional: levels.length > 1 };
}

/** The "In het kort" bullet points (max 4). */
export function extractPoints(introduction: string | null | undefined, max = 4): string[] {
  if (!introduction) return [];
  const items = [...introduction.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripHtml(m[1])).filter(Boolean);
  return items.slice(0, max).map((s) => clip(s, 190));
}

type ContentCategory = { category?: string; contentblocks?: { paragraphtitle?: string; paragraph?: string }[] };

/** Passport / visa / entry paragraph from the "prepare your trip" part of the advice. */
export function extractEntry(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const cat of content as ContentCategory[]) {
    for (const block of cat?.contentblocks || []) {
      const title = (block.paragraphtitle || "").toLowerCase();
      if (/paspoort|visum|inreis|toegang|identiteit|reisdocument/.test(title) && block.paragraph) {
        const text = stripHtml(block.paragraph);
        if (text) return clip(text, 260);
      }
    }
  }
  return null;
}

// Names people type that differ from the ISO / CLDR English name
const ALIASES: Record<string, string> = {
  usa: "US", us: "US", america: "US", unitedstatesofamerica: "US", unitedstates: "US",
  uk: "GB", england: "GB", scotland: "GB", wales: "GB", greatbritain: "GB", britain: "GB", unitedkingdom: "GB",
  holland: "NL", thenetherlands: "NL", netherlands: "NL",
  uae: "AE", dubai: "AE", abudhabi: "AE",
  czechia: "CZ", czechrepublic: "CZ", southkorea: "KR", korea: "KR", russia: "RU", turkey: "TR", turkiye: "TR",
  curacao: "CW", stmaarten: "SX", sintmaarten: "SX", saintmartin: "MF", stmartin: "MF", bonaire: "BQ",
};

let regionIndex: Map<string, string> | null = null;
function englishRegionIndex(): Map<string, string> {
  if (regionIndex) return regionIndex;
  const map = new Map<string, string>();
  try {
    const en = new Intl.DisplayNames(["en"], { type: "region" });
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const a of A) {
      for (const b of A) {
        const code = a + b;
        let name: string | undefined;
        try {
          name = en.of(code);
        } catch {
          continue;
        }
        if (name && name !== code && !/^Unknown/i.test(name)) map.set(normalizeName(name), code);
      }
    }
  } catch {
    // Intl.DisplayNames unavailable: only aliases and Dutch names will match
  }
  regionIndex = map;
  return map;
}

function dutchRegionName(code: string): string | null {
  try {
    const nl = new Intl.DisplayNames(["nl"], { type: "region" });
    const name = nl.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Parts of "City, Region, Country" from the end (country first). */
export function destinationParts(destination: string | null | undefined): string[] {
  return (destination || "")
    .split(/[,;/|–—-]\s+|,/)
    .map((p) => p.trim())
    .filter(Boolean)
    .reverse();
}

/**
 * Finds the advice entry for a free-text destination such as "Panama City, Panama" or "Oranjestad, Aruba".
 * Tries the last part first (the country), then earlier parts. Matches Dutch names from the list directly,
 * then English names through the Dutch region name.
 */
export function matchAdvisory(list: AdvisoryListItem[], destination: string | null | undefined): AdvisoryListItem | null {
  const parts = destinationParts(destination);
  if (parts.length === 0 || list.length === 0) return null;

  const byName = new Map<string, AdvisoryListItem>();
  for (const item of list) {
    if (item.location) byName.set(normalizeName(item.location), item);
    if (item.locationkey) byName.set(normalizeName(item.locationkey), item);
  }
  const english = englishRegionIndex();

  for (const part of parts) {
    const key = normalizeName(part);
    if (!key) continue;
    const direct = byName.get(key);
    if (direct) return direct;

    const code = ALIASES[key] || english.get(key);
    if (code) {
      const dutch = dutchRegionName(code);
      if (dutch) {
        const hit = byName.get(normalizeName(dutch));
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** "Laatst gewijzigd op: 05-10-2026 | ..." or the ISO lastmodified → YYYY-MM-DD. */
export function updatedDate(lastmodified: string | null | undefined): string | null {
  const m = (lastmodified || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** The API answers in XML unless `output=json` is in the query string (the Accept header is ignored). */
export function jsonUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set("output", "json");
  return u.toString();
}

async function getJson(rawUrl: string): Promise<unknown> {
  const url = jsonUrl(rawUrl);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TravelExpenseTracker/1.0 (https://github.com/saboaua/travel-expense-tracker)" },
    next: { revalidate: 60 * 60 * 12 },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`advice api ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("advice api returned XML");
  return JSON.parse(text);
}

function asList(json: unknown): AdvisoryListItem[] {
  const arr = Array.isArray(json)
    ? json
    : Array.isArray((json as { traveladviceSummaries?: unknown })?.traveladviceSummaries)
      ? (json as { traveladviceSummaries: unknown[] }).traveladviceSummaries
      : [];
  return (arr as AdvisoryListItem[]).filter((x) => x && typeof x.location === "string");
}

/** Never throws. */
export async function fetchAdvisory(destination: string | null | undefined): Promise<Advisory> {
  let list: AdvisoryListItem[];
  try {
    list = asList(await getJson(`${API_BASE}/traveladvice?rows=200`));
    // The list is capped at 200 per page
    if (list.length >= 200) list = [...list, ...asList(await getJson(`${API_BASE}/traveladvice?rows=200&offset=200`)).slice(0, 200)];
  } catch (e) {
    console.error("[advisory] list", e instanceof Error ? e.message : e);
    return { status: "unavailable", url: ADVICE_HOME };
  }

  const item = matchAdvisory(list, destination);
  if (!item) return { status: "not_found", url: ADVICE_HOME };

  const url = item.canonical || (item.locationkey ? `${ADVICE_HOME}/${item.locationkey}` : ADVICE_HOME);
  let intro = item.introduction || "";
  let content: unknown = null;
  let modified = item.lastmodified || null;

  if (item.dataurl) {
    try {
      const doc = (await getJson(item.dataurl)) as { introduction?: string; content?: unknown; lastmodified?: string };
      if (doc?.introduction) intro = doc.introduction;
      content = doc?.content ?? null;
      modified = doc?.lastmodified || modified;
    } catch (e) {
      console.error("[advisory] detail", e instanceof Error ? e.message : e);
    }
  }

  const { level, regional } = parseColour(intro || item.introduction);
  return {
    status: "found",
    country: item.location,
    level,
    regional,
    points: extractPoints(intro),
    entry: extractEntry(content),
    updated: updatedDate(modified),
    url,
  };
}
