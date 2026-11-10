import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/flights";

/** What a trip card needs about the next flight (worked out on the server). */
export interface FlightLineInfo {
  number: string;
  from: string;
  to: string;
  time: string;
  status: string;
  tone: StatusTone;
  more: number;
}

const TONE: Record<StatusTone, string> = {
  ok: "text-emerald-800 dark:text-emerald-300",
  warn: "text-amber-800 dark:text-amber-300",
  bad: "text-red-800 dark:text-red-300",
  info: "text-blue-800 dark:text-blue-300",
  muted: "text-muted-foreground",
};

/** One line on a trip card: the next flight, its route, departure time and status. */
export function FlightLine({ flight }: { flight: FlightLineInfo }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="trip-flight-line">
      <Plane className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {flight.number} · {flight.from} to {flight.to} · {flight.time}
        {flight.more > 0 && ` · +${flight.more} more`}
      </span>
      <span className={cn("shrink-0 font-semibold", TONE[flight.tone])}>{flight.status}</span>
    </p>
  );
}
