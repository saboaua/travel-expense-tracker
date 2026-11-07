"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

export type Brand = { appName: string; logoUrl: string | null; primaryColor: string; personalEnabled: boolean };

const INITIAL: Brand = { appName: "Expense Tracker", logoUrl: null, primaryColor: "#4f46e5", personalEnabled: true };
const FRESH_MS = 60_000;

let current: Brand = INITIAL;
let at = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Forget the settings (on sign-out). */
export function resetBrandCache() {
  current = INITIAL;
  at = 0;
  inflight = null;
  listeners.forEach((l) => l());
}

async function fetchBrand(): Promise<void> {
  const supabase = createClient();
  // Two questions asked together; the switch is separate so the app keeps working before the personal migration has been run
  const [settingsRes, flagRes] = await Promise.all([
    supabase.from("app_settings").select("app_name, logo_url, primary_color").eq("id", 1).single(),
    supabase.from("app_settings").select("personal_enabled").eq("id", 1).single(),
  ]);
  const s = settingsRes.data;
  const next: Brand = { ...current };
  if (s) {
    next.appName = s.app_name || INITIAL.appName;
    next.logoUrl = s.logo_url;
    if (s.primary_color) {
      next.primaryColor = s.primary_color;
      document.documentElement.style.setProperty("--brand-primary", s.primary_color);
    }
  }
  if (flagRes.data) next.personalEnabled = flagRes.data.personal_enabled !== false;
  if (s || flagRes.data) {
    current = next;
    at = Date.now();
    listeners.forEach((l) => l());
  }
}

function ensureBrand(): Promise<void> {
  if (at && Date.now() - at < FRESH_MS) return Promise.resolve();
  if (!inflight) inflight = fetchBrand().catch(() => {}).finally(() => { inflight = null; });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** App name, logo, colour and the personal switch: asked once and shared by the sidebar and the phone menu. */
export function useBrand(): Brand {
  const brand = useSyncExternalStore(subscribe, () => current, () => INITIAL);
  useEffect(() => { void ensureBrand(); }, []);
  return brand;
}
