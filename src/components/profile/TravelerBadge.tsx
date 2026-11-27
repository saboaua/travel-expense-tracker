"use client";

import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { countryName } from "@/lib/scan-destination";
import { readTraveler, TRAVELER_FROM, type TravelerState } from "@/lib/country";
import { Button } from "@/components/ui/button";

/** The Groceries traveler picture: a globe medal with the number of countries. Grey when not earned yet. */
export function TravelerMedal({ size = 64, count = 0, locked = false }: { size?: number; count?: number; locked?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-md" style={{ width: size, height: size, background: locked ? "linear-gradient(145deg,#cbd5e1,#94a3b8)" : "linear-gradient(145deg,#14b8a6,#0f766e)", boxShadow: "inset 0 0 0 4px rgba(255,255,255,.35)" }} aria-hidden="true" data-testid={locked ? "traveler-medal-locked" : "traveler-medal"}>
      <Globe style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white px-1.5 text-[11px] font-extrabold leading-4" style={{ background: locked ? "#94a3b8" : "#f59e0b" }}>{count}</span>
    </span>
  );
}

const flagList = (cs: string[]) => cs.map((c) => countryName(c) ?? c);

/** Profile > Your badges: the Groceries traveler row, earned or not yet. */
export function TravelerRow({ t }: { t: TravelerState }) {
  const names = flagList(t.countries);
  return (
    <div className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${t.earned ? "" : "opacity-90"}`} data-testid="badge-traveler">
      <TravelerMedal size={52} count={t.countries.length} locked={!t.earned} />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2"><b className="text-base">Groceries traveler</b><span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-bold">{t.earned ? "Earned" : `${TRAVELER_FROM} countries`}</span></div>
        <p className="text-sm text-muted-foreground">{t.earned ? `Earned with prices from ${names.length} countries.` : "Share grocery prices in a second country to earn it."}</p>
        {names.length > 0 && <p className="mt-1 flex flex-wrap gap-1.5">{names.map((n) => <span key={n} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">{n}</span>)}</p>}
      </div>
    </div>
  );
}

/** Loads my_traveler(); null before migration_country.sql has been run. */
export function useTraveler(check = 0): TravelerState | null {
  const [t, setT] = useState<TravelerState | null>(null);
  useEffect(() => {
    (async () => { try { const r = await createClient().rpc("my_traveler"); if (!r.error) setT(readTraveler(r.data)); } catch { /* not set up */ } })();
  }, [check]);
  return t;
}

/** Shown once, when the Groceries traveler badge is earned. */
export function TravelerUnlock({ check = 0 }: { check?: number }) {
  const t = useTraveler(check);
  const [gone, setGone] = useState(false);
  if (!t || !t.earned || t.seen || gone) return null;
  const done = async () => { setGone(true); try { await createClient().rpc("ack_traveler"); } catch { /* shown again next time */ } };
  const names = flagList(t.countries);
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-slate-900/60 sm:items-center" role="dialog" aria-modal="true" aria-label="New badge: Groceries traveler" data-testid="traveler-unlock">
      <div className="relative w-full max-w-md rounded-t-[28px] bg-gradient-to-b from-teal-100 via-teal-50 to-white px-5 pb-6 pt-6 text-center shadow-2xl dark:from-teal-900/60 dark:via-slate-900 dark:to-slate-900 sm:rounded-[28px]">
        <button type="button" onClick={done} aria-label="Close" className="absolute right-3.5 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-600"><X className="h-5 w-5" aria-hidden="true" /></button>
        <p className="text-sm font-extrabold text-teal-700 dark:text-teal-300">New badge</p>
        <div className="my-4 flex justify-center"><TravelerMedal size={140} count={t.countries.length} /></div>
        <h2 className="text-2xl font-extrabold">Groceries traveler</h2>
        <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground">You shared grocery prices in {names.join(" and ")}. Thank you for helping shoppers in both.</p>
        <Button type="button" className="mt-5 min-h-12 w-full" onClick={done} data-testid="traveler-done">Done</Button>
      </div>
    </div>
  );
}
