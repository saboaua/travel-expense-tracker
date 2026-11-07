import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { iconHref } from "@/lib/brand-icon";

export const dynamic = "force-dynamic";

export async function GET() {
  let name = "Travel Expense Tracker";
  let theme = "#4f46e5";
  let logoUrl: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data } = await supabase
      .from("app_settings")
      .select("app_name, primary_color, logo_url")
      .eq("id", 1)
      .single();

    if (data) {
      if (data.app_name) name = data.app_name;
      if (data.primary_color) theme = data.primary_color;
      logoUrl = data.logo_url && /^https?:\/\//i.test(data.logo_url) ? data.logo_url : null;
    }
  } catch {
    // use defaults
  }

  const icon = (size: number) => (logoUrl ? iconHref(logoUrl, size) : size >= 512 ? "/icon-512.png" : "/icon-192.png");

  const manifest = {
    name,
    short_name: "Lifolio",
    description: "Scan receipts, track business travel expenses, and generate reports",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: theme,
    orientation: "portrait-primary",
    icons: [
      {
        src: icon(192),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
