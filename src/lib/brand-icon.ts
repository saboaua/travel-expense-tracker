import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

/** A short label that changes whenever the logo changes, so icon links change with it and caches let go of the old one. */
export function iconVersion(logoUrl: string | null | undefined): string {
  if (!logoUrl) return "0";
  let h = 5381;
  for (let i = 0; i < logoUrl.length; i++) h = ((h * 33) ^ logoUrl.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Icon links are kept by phones, browsers and the CDN for a day, so the link must change whenever the picture would.
 * The picture depends on the logo (iconVersion) and on how src/lib/icon-image.ts draws it (this number).
 * When icon-image.ts changes: raise ICON_RENDER and copy the new fingerprint that tests/icon.test.ts prints.
 */
export const ICON_RENDER = "2";
export const ICON_RENDER_SOURCE_FINGERPRINT = "2cf9b35b";

export type Brand = { logoUrl: string | null; appName: string | null; primaryColor?: string | null };

/** The logo address, app name and colour, read at most once a minute so pages (and the manifest) stay fast. */
export const getBrand = unstable_cache(
  async (): Promise<Brand> => {
    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      const { data } = await supabase.from("app_settings").select("app_name, logo_url, primary_color").eq("id", 1).single();
      const url = data?.logo_url as string | null | undefined;
      const name = (data?.app_name as string | null | undefined)?.trim();
      const colour = (data?.primary_color as string | null | undefined)?.trim();
      return { logoUrl: url && /^https?:\/\//i.test(url) ? url : null, appName: name || null, primaryColor: colour && /^#[0-9a-f]{3,8}$/i.test(colour) ? colour : null };
    } catch {
      return { logoUrl: null, appName: null, primaryColor: null };
    }
  },
  ["brand-settings"],
  { revalidate: 60 }
);

/** The current logo address (or null). */
export const getLogoUrl = async () => (await getBrand()).logoUrl;

/** Icon links that follow the logo and the drawing code: /api/icon?v=<version>&size=<px>. */
export const iconHref = (logoUrl: string | null, size = 512, maskable = false) => `/api/icon?v=${iconVersion(logoUrl)}${ICON_RENDER}&size=${size}${maskable ? "&maskable=1" : ""}`;

/**
 * The manifest link changes whenever anything inside the manifest would (logo, name, colour, or the icon drawing),
 * so the manifest itself can be kept by phones and the CDN for a day instead of being rebuilt on every visit.
 */
export function manifestHref(brand: Brand): string {
  return `/api/manifest?v=${iconVersion(`${brand.logoUrl ?? ""}|${brand.appName ?? ""}|${brand.primaryColor ?? ""}`)}${ICON_RENDER}`;
}
