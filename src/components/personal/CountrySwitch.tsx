"use client";

import { useState } from "react";
import { Check, ChevronDown, Globe2, LocateFixed } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { IconTile } from "@/components/ui/icon-tile";
import { countryName } from "@/lib/scan-destination";
import { currencyOfCountry, type CountryStat } from "@/lib/country";
import type { CountryState } from "@/components/personal/use-country";

const SOURCE_TEXT = { auto: "Automatic · from your location", home: "Your home country", manual: "Chosen by you" } as const;
const sourceText = (source: keyof typeof SOURCE_TEXT, how: "gps" | "network" | null) => (source === "auto" && how === "network" ? "Automatic · from your network" : SOURCE_TEXT[source]);

function Flag({ code, size = 38 }: { code: string; size?: number }) {
  const gpsTile = code === "GPS";
  return <IconTile tone={gpsTile ? "travel" : "place"} className="shrink-0" ><span className="flex items-center justify-center" style={{ width: size, height: size }}>{gpsTile ? <LocateFixed style={{ width: size * 0.55, height: size * 0.55 }} /> : <Globe2 style={{ width: size * 0.55, height: size * 0.55 }} />}</span></IconTile>;
}

/** The country the prices are for. It follows the location by itself; this row says so and lets the person pick another country. */
export function CountrySwitch({ state, stats }: { state: CountryState; stats: CountryStat[] | null }) {
  const [open, setOpen] = useState(false);
  const { country, source, notice } = state;
  if (!country) return null;
  const name = (c: string) => countryName(c) ?? c;
  const cur = (c: string) => currencyOfCountry(c);
  const label = (c: string) => `${name(c)}${cur(c) ? ` · ${cur(c)}` : ""}`;
  const listed = new Map<string, CountryStat>();
  for (const s of stats ?? []) listed.set(s.country, s);
  if (!listed.has(country)) listed.set(country, { country, stores: 0, prices: 0 });
  const rows = [...listed.values()].filter((s) => s.stores > 0 || s.prices > 0 || s.country === country);
  const choose = (c: string | null) => { state.pick(c); if (c === null) state.locate(); setOpen(false); };
  return (
    <div className="space-y-2" data-testid="country-switch">
      {notice && (
        <div role="status" className="flex items-center gap-3 rounded-2xl bg-slate-900 px-3.5 py-3 text-white" data-testid="country-notice">
          <Flag code={notice.to} size={34} />
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">Now showing {name(notice.to)} prices</p><p className="text-xs text-slate-300">You are in {name(notice.to)}.{cur(notice.to) ? ` Prices are in ${cur(notice.to)}.` : ""}</p></div>
          <button type="button" onClick={state.undo} className="min-h-11 px-2 text-sm font-bold text-blue-300" data-testid="country-undo">Undo</button>
        </div>
      )}
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2 text-left" data-testid="country-button">
        <Flag code={country} />
        <span className="min-w-0 flex-1"><span className="block text-base font-bold" data-testid="country-label">{label(country)}</span><span className="block text-xs text-muted-foreground">{sourceText(source, state.how)}</span></span>
        <ChevronDown className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </button>
      {source !== "manual" && state.how !== "gps" && (
        <button type="button" onClick={state.locate} disabled={state.locating} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-bold text-primary" data-testid="country-locate"><LocateFixed className="h-4 w-4" aria-hidden="true" />{state.locating ? "Finding you…" : "Use my exact location"}</button>
      )}
      {open && (
        <BottomSheet title="Show prices for" onClose={() => setOpen(false)} testId="country-sheet">
          <ul className="divide-y">
            <li><button type="button" onClick={() => choose(null)} className="flex min-h-16 w-full items-center gap-3 text-left" data-testid="country-auto">
              <Flag code="GPS" size={40} /><span className="flex-1"><b className="block text-base">Where I am · Automatic</b><span className="text-xs text-muted-foreground">Follows your location</span></span>{source !== "manual" && <Check className="h-5 w-5 text-primary" aria-hidden="true" />}
            </button></li>
            {rows.map((s) => (
              <li key={s.country}><button type="button" onClick={() => choose(s.country)} className="flex min-h-16 w-full items-center gap-3 text-left" data-testid={`country-option-${s.country}`}>
                <Flag code={s.country} size={40} /><span className="flex-1"><b className="block text-base">{label(s.country)}</b><span className="text-xs text-muted-foreground">{s.stores} store{s.stores === 1 ? "" : "s"} · {s.prices.toLocaleString("en-US")} community price{s.prices === 1 ? "" : "s"}</span></span>{source === "manual" && s.country === country && <Check className="h-5 w-5 text-primary" aria-hidden="true" />}
              </button></li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-muted-foreground">Only countries that have stores or prices are listed.</p>
        </BottomSheet>
      )}
    </div>
  );
}
