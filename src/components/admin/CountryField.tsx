"use client";

import { CURRENCY_OF_COUNTRY } from "@/lib/country";
import { countryName } from "@/lib/scan-destination";

const OPTIONS = Object.keys(CURRENCY_OF_COUNTRY)
  .map((c) => ({ code: c, name: countryName(c) ?? c, cur: CURRENCY_OF_COUNTRY[c] }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The country a file is for. Every row of the file is saved for it. */
export function CountryField({ value, onChange, disabled }: { value: string; onChange: (code: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5" data-testid="country-field">
      <label htmlFor="import-country" className="text-sm font-bold">Country for this file</label>
      <select id="import-country" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid="import-country" className="h-12 w-full rounded-xl border bg-background px-3 text-base font-semibold">
        {OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.name} · {o.cur}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Every row in the file is saved for this country. Choose it before the file.</p>
    </div>
  );
}
