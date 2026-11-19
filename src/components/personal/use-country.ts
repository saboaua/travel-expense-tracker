"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { currentPlace } from "@/lib/scan-place";
import { chooseCountry, codeOfCountryName, normCountry, shouldAnnounce, type CountrySource } from "@/lib/country";

const MANUAL = "lifolio:country:manual";
const LAST = "lifolio:country:last";
const DETECTED = "lifolio:country:detected";
const FRESH_MS = 10 * 60 * 1000;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* fine */ } };

/** The country the person was last in, without waiting for a lookup (for sending prices). */
export const knownCountry = (): string | null => normCountry(read(LAST));

/** Where the person is, as a country code: GPS when they already allowed it, otherwise the approximate place from the network. */
async function detect(): Promise<string | null> {
  try {
    const cached = JSON.parse(read(DETECTED) ?? "null") as { c: string; t: number } | null;
    if (cached && Date.now() - cached.t < FRESH_MS) return cached.c;
  } catch { /* detect again */ }
  let code: string | null = null;
  // GPS when the person already allowed it: the most exact answer
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (perm?.state === "granted") code = normCountry((await currentPlace())?.countryCode);
  } catch { /* no permissions api */ }
  // otherwise the country the network says (works with no permission and no coordinates)
  if (!code) {
    try {
      const r = await fetch("/api/country", { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (r.ok) code = normCountry(((await r.json()) as { countryCode?: string | null }).countryCode);
    } catch { /* offline */ }
  }
  if (code) write(DETECTED, JSON.stringify({ c: code, t: Date.now() }));
  return code;
}

export type CountryState = {
  country: string | null;
  source: CountrySource;
  /** the home country from Profile, when it is known */
  homeCountry: string | null;
  /** the country just switched to by itself, with the one before it, for the short "Now showing" message */
  notice: { from: string; to: string } | null;
  /** pick a country, or null to follow the location again */
  pick: (code: string | null) => void;
  undo: () => void;
  dismiss: () => void;
  ready: boolean;
};

/** The country Best store and the Price tracker use. Switches by itself when the location changes country. */
export function useCountry(): CountryState {
  const [manual, setManual] = useState<string | null>(() => normCountry(read(MANUAL)));
  const [detected, setDetected] = useState<string | null>(null);
  const [home, setHome] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ from: string; to: string } | null>(null);
  const [ready, setReady] = useState(false);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const [d, h] = await Promise.all([
        detect(),
        (async () => { try { const sb = createClient(); const { data: { session } } = await sb.auth.getSession(); if (!session) return null; const r = await sb.from("profiles").select("home_country").eq("id", session.user.id).single(); return codeOfCountryName(r.data?.home_country); } catch { return null; } })(),
      ]);
      if (off) return;
      setDetected(d); setHome(h); setReady(true);
    })();
    return () => { off = true; };
  }, []);

  const choice = chooseCountry({ manual, detected, home });
  const country = choice.country;

  // Announce a change of the automatic country once, then remember it as the one the person is in
  useEffect(() => {
    if (!ready || !country) return;
    const last = normCountry(read(LAST));
    if (choice.source === "auto" && shouldAnnounce(last, country) && announced.current !== country) {
      announced.current = country;
      setNotice({ from: last!, to: country });
    }
    write(LAST, country);
  }, [ready, country, choice.source]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  const pick = useCallback((code: string | null) => { const c = normCountry(code); write(MANUAL, c); setManual(c); setNotice(null); }, []);
  const undo = useCallback(() => { if (notice) { write(LAST, notice.from); write(MANUAL, notice.from); setManual(notice.from); setNotice(null); } }, [notice]);
  return { country, source: choice.source, homeCountry: home, notice, pick, undo, dismiss: () => setNotice(null), ready };
}

import type { CountryStat } from "@/lib/country";
import { readCountryStats } from "@/lib/country";

/** Which countries have supermarkets or community prices. null while loading or before migration_country.sql has been run. */
export function useCountryStats(): CountryStat[] | null {
  const [stats, setStats] = useState<CountryStat[] | null>(null);
  useEffect(() => {
    let off = false;
    (async () => { try { const r = await createClient().rpc("price_countries"); if (!off && !r.error) setStats(readCountryStats(r.data)); } catch { /* migration not run */ } })();
    return () => { off = true; };
  }, []);
  return stats;
}
