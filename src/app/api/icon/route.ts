import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data } = await supabase
      .from("app_settings")
      .select("logo_url")
      .eq("id", 1)
      .single();

    const logoUrl = data?.logo_url as string | null | undefined;

    if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
      const res = await fetch(logoUrl, { cache: "no-store" });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "image/png";
        return new NextResponse(buf, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=300",
          },
        });
      }
    }
  } catch {
    // fall through to default
  }

  // Fallback to static icon
  return NextResponse.redirect(new URL("/icon-512.png", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
}
