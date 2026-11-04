import { daysBetween } from "@/lib/utils";

export type ListTrip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  total: number;
  count: number;
};

export type Phase = "ongoing" | "upcoming" | "ended" | "completed";

const endOf = (t: { start_date: string; end_date: string | null }) => t.end_date || t.start_date;

/** Where a trip is in time. "ended" = dates have passed but it is still open for receipts. */
export function tripPhase(t: ListTrip, today: string): Phase {
  if (t.status === "completed") return "completed";
  if (t.start_date > today) return "upcoming";
  if (endOf(t) < today) return "ended";
  return "ongoing";
}

export function phaseLabel(t: ListTrip, today: string): string {
  const phase = tripPhase(t, today);
  if (phase === "upcoming") {
    const d = daysBetween(today, t.start_date);
    return d === 0 ? "Starts today" : d === 1 ? "Starts tomorrow" : `In ${d} days`;
  }
  if (phase === "ongoing") {
    const left = daysBetween(today, endOf(t));
    return left <= 0 ? "Last day" : `Day ${daysBetween(t.start_date, today) + 1} · ${left} left`;
  }
  if (phase === "ended") return "Ended · ready to close";
  return "Completed";
}

/** In progress first, then upcoming (soonest first), then ended-but-open (most recent first). */
export function sortActive(trips: ListTrip[], today: string): ListTrip[] {
  const rank: Record<Phase, number> = { ongoing: 0, upcoming: 1, ended: 2, completed: 3 };
  return trips
    .filter((t) => t.status !== "completed")
    .sort((a, b) => {
      const pa = tripPhase(a, today);
      const pb = tripPhase(b, today);
      if (pa !== pb) return rank[pa] - rank[pb];
      return pa === "upcoming" ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date);
    });
}

/** Completed trips, newest first, grouped by the year they started. */
export function groupCompletedByYear(trips: ListTrip[]): { year: string; trips: ListTrip[]; total: number }[] {
  const done = trips.filter((t) => t.status === "completed").sort((a, b) => b.start_date.localeCompare(a.start_date));
  const groups = new Map<string, ListTrip[]>();
  for (const t of done) {
    const y = t.start_date.slice(0, 4);
    groups.set(y, [...(groups.get(y) || []), t]);
  }
  return [...groups.entries()].map(([year, list]) => ({ year, trips: list, total: list.reduce((s, t) => s + t.total, 0) }));
}

/** Case- and accent-insensitive match on name and destination. */
export function matchesQuery(t: ListTrip, query: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return q.split(/\s+/).every((word) => fold(`${t.name} ${t.destination || ""}`).includes(word));
}
