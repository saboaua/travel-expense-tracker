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

async function searchWikipedia(query: string): Promise<DestinationInfo | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
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
    headers: { "User-Agent": "TravelExpenseTracker/1.0 (https://github.com/saboaua/travel-expense-tracker)" },
    next: { revalidate: 60 * 60 * 24 * 7 }, // cache for a week
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { query?: { pages?: WikiPage[] } };
  const pages = (json.query?.pages || []).slice().sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  if (pages.length === 0) return null;

  // Best-ranked page that has a picture; otherwise best-ranked page for the text alone.
  const best = pages.find((p) => p.thumbnail?.source) || pages[0];
  return {
    title: best.title,
    summary: best.extract?.trim() || null,
    imageUrl: best.thumbnail?.source || null,
    pageUrl: best.fullurl || null,
  };
}

/**
 * Looks up a destination (e.g. "Panama City, Panama") and returns a short description
 * and a representative photo. Never throws; returns null when nothing is found.
 */
export async function getDestinationInfo(destination: string | null | undefined): Promise<DestinationInfo | null> {
  const full = destination?.trim();
  if (!full) return null;

  const attempts = [full];
  const first = full.split(",")[0].trim();
  if (first && first !== full) attempts.push(first);

  let textOnly: DestinationInfo | null = null;
  for (const q of attempts) {
    try {
      const info = await searchWikipedia(q);
      if (info?.imageUrl) return info;
      if (info && !textOnly) textOnly = info;
    } catch {
      // network error / timeout: try the next variant
    }
  }
  return textOnly;
}
