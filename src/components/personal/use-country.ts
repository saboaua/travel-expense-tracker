"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { chooseCountry, codeOfCountryName, normCountry, shouldAnnounce, type CountrySource } from "@/lib/country";

const MANUAL = "lifolio:country:manual";
/** Where the person was when they picked by hand: a pick lasts until they are somewhere else. */
const MANUAL_AT = "lifolio:country:manualAt";
const LAST = "lifolio:country:last";
const DETECTED = "lifolio:country:detected";
const FRESH_MS = 10 * 60 * 1000;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* fine */ } };

/** The country the person was last in, without waiting for a lookup (for sending prices). */
export const knownCountry = (): string | null => normCountry(read(LAST));

export type Detected = { code: string; how: "gps" | "network" };

const gps = () => new Promise<{ lat: number; lon: number } | null>((resolve) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), () => resolve(null), { timeout: 8000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false });
});
const countryAt = async (q: string): Promise<string | null> => {
  try {
    const r = await fetch(`/api/country${q}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return r.ok ? normCountry(((await r.json()) as { countryCode?: string | null }).countryCode) : null;
  } catch { return null; }
};

/**
 * Where the person is, as a country code. The phone's location is asked for (once, by the browser) because the network address can
 * name another country, for example on a roaming line. When location is off or refused, the country the network says is used.
 */
async function detect(force = false): Promise<Detected | null> {
  if (!force) {
    try {
      const cached = JSON.parse(read(DETECTED) ?? "null") as { c: string; t: number; h?: "gps" | "network" } | null;
      if (cached && Date.now() - cached.t < FRESH_MS && cached.h === "gps") return { code: cached.c, how: "gps" };
    } catch { /* detect again */ }
  }
  let perm: PermissionState | null = null;
  try { perm = (await navigator.permissions?.query({ name: "geolocation" as PermissionName }))?.state ?? null; } catch { /* no permissions api */ }
  let out: Detected | null = null;
  if (perm !== "denied") {
    const at = await gps(); // shows the browser's own question when it has not been asked yet
    if (at) { const c = await countryAt(`?lat=${at.lat}&lon=${at.lon}`); if (c) out = { code: c, how: "gps" }; }
  }
  if (!out) { const c = await countryAt(""); if (c) out = { code: c, how: "network" }; }
  if (out) write(DETECTED, JSON.stringify({ c: out.code, t: Date.now(), h: out.how }));
  return out;
}

export type CountryState = {
  country: string | null;
  source: CountrySource;
  /** the home country from Profile, when it is known */
  homeCountry: string | null;
  /** how the automatic country was found: the phone's location, or only the network address */
  how: "gps" | "network" | null;
  /** ask the phone for its exact location again */
  locate: () => void;
  /** true while the phone's location is being read */
  locating: boolean;
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
  const [how, setHow] = useState<"gps" | "network" | null>(null);
  const [locating, setLocating] = useState(false);
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
      // A hand-picked country is for the place it was picked in; once the location is another country (back home), follow the location again
      const at = normCountry(read(MANUAL_AT));
      if (d?.code && at && at !== normCountry(d.code)) { write(MANUAL, null); write(MANUAL_AT, null); setManual(null); }
      setDetected(d?.code ?? null); setHow(d?.how ?? null); setHome(h); setReady(true);
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

  const locate = useCallback(() => {
    setLocating(true);
    detect(true).then((d) => { setDetected(d?.code ?? null); setHow(d?.how ?? null); }).finally(() => setLocating(false));
  }, []);
  const pick = useCallback((code: string | null) => { const c = normCountry(code); write(MANUAL, c); write(MANUAL_AT, c ? detected : null); setManual(c); setNotice(null); }, [detected]);
  const undo = useCallback(() => { if (notice) { write(LAST, notice.from); write(MANUAL, notice.from); write(MANUAL_AT, detected); setManual(notice.from); setNotice(null); } }, [notice, detected]);
  return { country, source: choice.source, homeCountry: home, how, locate, locating, notice, pick, undo, dismiss: () => setNotice(null), ready };
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
