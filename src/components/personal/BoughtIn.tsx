"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CURRENCY_OF_COUNTRY, normCountry } from "@/lib/country";
import { countryName } from "@/lib/scan-destination";

const ALL = Object.keys(CURRENCY_OF_COUNTRY).map((c) => ({ code: c, name: countryName(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name));
const name = (c: string) => countryName(c) ?? c;

/**
 * Where a receipt or a price was bought. Its prices go to the community of that country, whatever the currency. The budget does not
 * look at it. Starts from where the app finds the person; Change picks the country where they are, their home country, or another one.
 */
export function BoughtIn({ value, detected, home, onChange }: { value: string | null; detected: string | null; home: string | null; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(value);
  const [other, setOther] = useState("");
  const here = normCountry(detected);
  const mine = normCountry(home);
  const note = !value ? "Not set. Its prices follow the currency." : value === here ? "Found from your location." : "Chosen by you.";
  const options = [here && { code: here, text: "Where you are now" }, mine && mine !== here && { code: mine, text: "Your home country" }].filter(Boolean) as { code: string; text: string }[];
  const chosen = pick ?? "";
  return (
    <div data-testid="bought-in" className="space-y-2">
      <div className="flex min-h-16 items-center gap-3 rounded-xl border border-primary/60 bg-card px-3 py-2">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200"><MapPin className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Bought in</span>
          <span className="block text-base font-extrabold" data-testid="bought-in-country">{value ? name(value) : "Not set"}</span>
          <span className="block text-xs text-muted-foreground">{note}</span>
        </span>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => { setPick(value); setOther(""); setOpen(true); }} data-testid="bought-in-change">Change</Button>
      </div>
      {value && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="bought-in-note">Your budget counts this like any other. Only the item prices are shared, and only with people shopping in {name(value)}.</p>}
      {open && (
        <BottomSheet title="Bought in" onClose={() => setOpen(false)} testId="bought-in-sheet">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Which community should get these prices?</p>
            <fieldset className="divide-y rounded-xl border px-3">
              <legend className="sr-only">Country</legend>
              {options.map((o) => (
                <label key={o.code} className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                  <input type="radio" name="bought-in" checked={pick === o.code && !other} onChange={() => { setPick(o.code); setOther(""); }} className="h-5 w-5 accent-primary" data-testid={`bought-in-option-${o.code}`} />
                  <span><span className="block text-[15px] font-bold">{name(o.code)}</span><span className="block text-xs text-muted-foreground">{o.text}</span></span>
                </label>
              ))}
              <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                <input type="radio" name="bought-in" checked={!!other} onChange={() => setOther(other || ALL[0].code)} className="h-5 w-5 accent-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">Another country</span>
                  <Select aria-label="Another country" className="mt-1 h-10" value={other} onChange={(e) => { setOther(e.target.value); if (e.target.value) setPick(e.target.value); }} data-testid="bought-in-other">
                    <option value="">Choose…</option>
                    {ALL.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </Select>
                </span>
              </label>
            </fieldset>
            <p className="text-xs text-muted-foreground">Only prices are shared with that country. Nothing about the receipt, your name or the total.</p>
            <Button type="button" className="min-h-[52px] w-full" disabled={!chosen} onClick={() => { onChange(chosen); setOpen(false); }} data-testid="bought-in-use">{chosen ? `Use ${name(chosen)}` : "Choose a country"}</Button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
