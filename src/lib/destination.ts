export type DestinationInfo = {
  title: string;
  summary: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
};

type WikiPage = {
  index?: number;
  title: string;
  extract?: string;
  fullurl?: string;
  thumbnail?: { source: string };
};

// Flags, maps, seals and logos are poor "photos" of a place
const NOT_A_PHOTO = /(flag|coat[_ ]of[_ ]arms|locator|location[_ ]map|\bmap\b|_map|map_|seal|logo|emblem|blason|escudo|wordmark|icon)/i;

const USER_AGENT = "TravelExpenseTracker/1.0 (https://github.com/saboaua/travel-expense-tracker)";

async function searchWikipedia(query: string): Promise<DestinationInfo | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "5",
    redirects: "1",
    prop: "pageimages|extracts|info",
    piprop: "thumbnail",
    pithumbsize: "1400",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    inprop: "url",
  }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 }, // cache for a day
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { query?: { pages?: WikiPage[] } };
  const pages = (json.query?.pages || []).slice().sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  if (pages.length === 0) return null;

  const usable = (p: WikiPage) => {
    const src = p.thumbnail?.source;
    return !!src && !NOT_A_PHOTO.test(decodeURIComponent(src.split("/").pop() || ""));
  };

  const withPhoto = pages.find(usable);
  const best = withPhoto || pages[0];
  return {
    title: best.title,
    summary: best.extract?.trim() || null,
    imageUrl: withPhoto?.thumbnail?.source || null,
    pageUrl: best.fullurl || null,
  };
}

/**
 * Looks up a destination (e.g. "Panama City, Panama") and returns a short description
 * and a representative photo. Several phrasings are tried in parallel so a place whose
 * main article only has a flag or map still gets a skyline/city photo.
 * Never throws; returns null when nothing is found.
 */
export async function getDestinationInfo(destination: string | null | undefined): Promise<DestinationInfo | null> {
  const full = destination?.trim();
  if (!full) return null;

  const first = full.split(",")[0].trim();
  const queries = Array.from(new Set([full, first, `${first} skyline`, `${first} city`].filter(Boolean)));

  const results = await Promise.all(queries.map((q) => searchWikipedia(q).catch(() => null)));

  // Priority order = order of the queries above
  const withImage = results.find((r) => r?.imageUrl);
  if (withImage) {
    // Keep the best text we found, even if it came from a different query than the photo
    const text = results.find((r) => r?.summary);
    return { ...withImage, summary: results[0]?.summary || text?.summary || withImage.summary };
  }
  return results.find((r) => r) || null;
}
