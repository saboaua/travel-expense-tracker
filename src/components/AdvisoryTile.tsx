"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileCheck2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LEVEL_META, type Advisory, type AdvisoryLevel } from "@/lib/advisory";
import { cn, formatDate } from "@/lib/utils";

// Classes live here (not in src/lib) so Tailwind sees them
const LEVEL_STYLE: Record<AdvisoryLevel, { dot: string; chip: string }> = {
  green: { dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  yellow: { dot: "bg-yellow-400", chip: "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300" },
  orange: { dot: "bg-orange-500", chip: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300" },
  red: { dot: "bg-red-500", chip: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" },
  unknown: { dot: "bg-slate-400", chip: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" },
};

type State = { status: "loading" } | { status: "ready"; data: Advisory } | { status: "error" };

/** Dutch government travel advice for a trip's destination. */
export function AdvisoryTile({ tripId, destination }: { tripId: string; destination: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/advisory?trip=${encodeURIComponent(tripId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: Advisory) => !cancelled && setState({ status: "ready", data }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const header = (
    <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Travel advice
      <span className="truncate font-normal">· {destination}</span>
    </p>
  );

  if (state.status === "loading") {
    return (
      <Card className="space-y-3 p-5" aria-busy="true">
        {header}
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  if (state.status === "error" || state.data.status !== "found") {
    const url = state.status === "ready" ? state.data.url : "https://www.nederlandwereldwijd.nl/reisadvies";
    const msg =
      state.status === "ready" && state.data.status === "not_found"
        ? "No Dutch advice matched this destination. Edit the trip destination to include the country, or search it yourself."
        : "Travel advice is unavailable right now.";
    return (
      <Card className="space-y-2 p-5">
        {header}
        <p className="text-sm text-muted-foreground">{msg}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Dutch travel advice <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </Card>
    );
  }

  const a = state.data;
  const style = LEVEL_STYLE[a.level];
  const meta = LEVEL_META[a.level];

  return (
    <Card className="space-y-3 p-5">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold", style.chip)}>
          <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden="true" />
          {meta.label}
        </span>
        <span className="text-sm text-muted-foreground">{a.country}: {meta.meaning}</span>
      </div>
      {a.regional && (
        <p className="text-xs text-muted-foreground">Some parts of the country have a different colour code. Check the full advice before going.</p>
      )}

      {a.points.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {a.points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {a.entry && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" /> Entry (for Dutch passport holders)
          </p>
          {a.entry}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span>
          Source: Dutch Ministry of Foreign Affairs (in Dutch){a.updated ? ` · updated ${formatDate(a.updated)}` : ""}
        </span>
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Full advice <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </Card>
  );
}
