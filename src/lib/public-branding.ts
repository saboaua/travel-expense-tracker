import { createClient } from "@/lib/supabase/server";

export type PublicBranding = {
  app_name: string;
  logo_url: string | null;
  primary_color: string;
  login_logo_size: number;
  privacy_policy: string | null;
  support_email: string | null;
};

const DEFAULTS: PublicBranding = {
  app_name: "Travel Expense Tracker",
  logo_url: null,
  primary_color: "#4f46e5",
  login_logo_size: 56,
  privacy_policy: null,
  support_email: null,
};

/** Branding for public (signed-out) pages. Falls back to defaults if the migration has not run. */
export async function getPublicBranding(): Promise<PublicBranding> {
  const supabase = await createClient();
  const full = await supabase
    .from("app_settings")
    .select("app_name, logo_url, primary_color, login_logo_size, privacy_policy, support_email")
    .eq("id", 1)
    .single();
  if (!full.error && full.data) return { ...DEFAULTS, ...stripNulls(full.data) } as PublicBranding;

  const basic = await supabase.from("app_settings").select("app_name, logo_url, primary_color").eq("id", 1).single();
  return { ...DEFAULTS, ...stripNulls(basic.data || {}) } as PublicBranding;
}

function stripNulls<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== null || k === "logo_url" || k === "privacy_policy" || k === "support_email"));
}
