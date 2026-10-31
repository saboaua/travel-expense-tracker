import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  let name = "Travel Expense Tracker";
  let theme = "#4f46e5";
  let hasLogo = false;

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
      hasLogo = !!data.logo_url;
    }
  } catch {
    // use defaults
  }

  const iconSrc = hasLogo ? "/api/icon" : "/icon-512.png";

  const manifest = {
    name,
    short_name: name.slice(0, 12),
    description: "Scan receipts, track business travel expenses, and generate reports",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: theme,
    orientation: "portrait-primary",
    icons: [
      {
        src: iconSrc,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: iconSrc,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: iconSrc,
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
