/** Pure rules for the trip cards on the dashboard (owner card and the compact "Shared with you" card). */
import { daysBetween } from "@/lib/utils";
import { FLIGHT_LEGS, type FlightLeg } from "@/lib/flights";

export type TripBadge = { label: string; tone: "upcoming" | "progress" | "passed" };

/** "Upcoming · 7 days left", "In progress" or "Passed". Dates are plain YYYY-MM-DD days. */
export function tripBadge(start: string | null, end: string | null, today: string): TripBadge | null {
  const first = start || end;
  if (!first) return null;
  const last = end || first;
  if (first > today) {
    const d = daysBetween(today, first);
    return { label: `Upcoming · ${d} day${d !== 1 ? "s" : ""} left`, tone: "upcoming" };
  }
  if (last >= today) return { label: "In progress", tone: "progress" };
  return { label: "Passed", tone: "passed" };
}

export const BADGE_CLASS: Record<TripBadge["tone"], string> = {
  upcoming: "bg-emerald-500 text-white",
  progress: "bg-blue-500 text-white",
  passed: "bg-amber-500 text-white",
};

/** "OUTBOUND" / "RETURN" / "CONNECTION" tag for a flight line. */
export const legTag = (leg: FlightLeg): string => (FLIGHT_LEGS.find((l) => l.id === leg)?.label ?? leg).toUpperCase();

/** At most `max` flights are listed; the rest become "+1 more flight". */
export function limitFlights<T>(list: T[], max = 2): { shown: T[]; more: number } {
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}
export const moreFlightsLabel = (n: number) => `+${n} more flight${n === 1 ? "" : "s"}`;
