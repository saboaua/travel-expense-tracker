import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/** A short label that changes whenever the logo changes, so icon links change with it and caches let go of the old one. */
export function iconVersion(logoUrl: string | null | undefined): string {
  if (!logoUrl) return "0";
  let h = 5381;
  for (let i = 0; i < logoUrl.length; i++) h = ((h * 33) ^ logoUrl.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The current logo address (or null), read at most once a minute so pages stay fast. */
export const getLogoUrl = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).single();
      const url = data?.logo_url as string | null | undefined;
      return url && /^https?:\/\//i.test(url) ? url : null;
    } catch {
      return null;
    }
  },
  ["brand-logo-url"],
  { revalidate: 60 }
);

/** Icon links that follow the logo: /api/icon?v=<version>&size=<px>. */
export const iconHref = (logoUrl: string | null, size = 512) => `/api/icon?v=${iconVersion(logoUrl)}&size=${size}`;
