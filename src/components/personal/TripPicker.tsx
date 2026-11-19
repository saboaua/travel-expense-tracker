"use client";

import { useEffect, useState } from "react";
import { Briefcase, Check, Globe, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateRange } from "@/lib/utils";
import type { TripChoice } from "@/lib/paid-with";

/** The business and personal trips a receipt can be tagged to. Empty when none can be read (offline, no access). */
export function useTripChoices(): TripChoice[] {
  const [list, setList] = useState<TripChoice[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sb = createClient();
        const [t, p] = await Promise.all([
          sb.from("trips").select("id, name, destination, start_date, end_date").order("start_date", { ascending: false }).limit(12),
          sb.from("personal_projects").select("id, name, start_date, end_date").eq("kind", "personal_trip").order("start_date", { ascending: false }).limit(12),
        ]);
        if (!live) return;
        const biz = ((t.data ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null }[]).map((x): TripChoice => ({ ref: `trip:${x.id}`, label: x.name, kind: "trip", start: x.start_date, end: x.end_date }));
        const per = ((p.data ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null }[]).map((x): TripChoice => ({ ref: `ptrip:${x.id}`, label: x.name, kind: "ptrip", start: x.start_date, end: x.end_date }));
        setList([...biz, ...per]);
      } catch { /* offline: the field stays hidden */ }
    })();
    return () => { live = false; };
  }, []);
  return list;
}

/** "During trip": a personal receipt can say which trip it was paid on. A label only; it never adds to a business trip. */
export function TripPicker({ trips, value, suggested, onChange }: { trips: TripChoice[]; value: string | null; suggested: string | null; onChange: (v: string | null) => void }) {
  if (!trips.length) return null;
  // The chosen and suggested trips first, then the most recent
  const ordered = [...trips].sort((a, b) => Number(b.ref === value || b.ref === suggested) - Number(a.ref === value || a.ref === suggested)).slice(0, 4);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id="during-trip-label">During trip <span className="font-normal text-muted-foreground">(optional)</span></p>
      <div role="radiogroup" aria-labelledby="during-trip-label" className="space-y-2" data-testid="during-trip">
        {ordered.map((t) => {
          const on = t.ref === value;
          const Icon = t.kind === "trip" ? Briefcase : Globe;
          return (
            <button key={t.ref} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.ref)} data-testid={`during-${t.ref}`}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 p-2.5 text-left transition-colors ${on ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{t.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.kind === "trip" ? "Business trip" : "Personal trip"}{t.start ? ` · ${formatDateRange(t.start, t.end)}` : ""}{t.ref === suggested ? " · On that day" : ""}</span></span>
              {on && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} data-testid="during-none"
          className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 text-left text-sm font-semibold ${value === null ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
          <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Not on a trip
        </button>
      </div>
      <p className="text-xs text-muted-foreground">This stays a personal receipt. It never adds to the business trip.</p>
    </div>
  );
}
