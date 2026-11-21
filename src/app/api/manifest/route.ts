import { NextResponse } from "next/server";
import { getBrand, iconHref } from "@/lib/brand-icon";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Read from the one-minute shared copy, not from the database on every visit
  const brand = await getBrand();
  const name = brand.appName || "Travel Expense Tracker";
  const theme = brand.primaryColor || "#4f46e5";
  const logoUrl = brand.logoUrl;

  const icon = (size: number) => (logoUrl ? iconHref(logoUrl, size) : size >= 512 ? "/icon-512.png" : "/icon-192.png");
  // Android crops a maskable icon, so it gets its own copy with room around the logo
  const maskableIcon = iconHref(logoUrl, 512, true);

  // A client's private link installs as its own app: it opens that link, not the sign-in page
  const token = new URL(request.url).searchParams.get("s") || "";
  const clientLink = /^[0-9a-f]{32,64}$/i.test(token) ? `/s/${token}` : null;

  const manifest = {
    name: clientLink ? "My subscriptions" : name,
    short_name: clientLink ? "My IPTV" : name,
    description: "Scan receipts, track business travel expenses, and generate reports",
    id: clientLink ?? "/",
    start_url: clientLink ?? "/",
    scope: clientLink ?? "/",
    display: "standalone",
    display_override: ["standalone"],
    background_color: "#ffffff",
    theme_color: theme,
    orientation: "any",
    // Long-press the app icon on Android (not for a client's own app)
    ...(clientLink ? {} : {
      shortcuts: [
        { name: "New grocery receipt", short_name: "Groceries", url: "/personal/groceries/new" },
        { name: "New shopping receipt", short_name: "Shopping", url: "/personal/shopping/new" },
        { name: "New business trip", short_name: "New trip", url: "/trips/new" },
      ],
      // Share a photo or PDF from the gallery or another app straight into the app (Android); see public/sw.js
      share_target: {
        action: "/share-target",
        method: "POST",
        enctype: "multipart/form-data",
        params: { files: [{ name: "file", accept: ["image/*", "application/pdf"] }] },
      },
    }),
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
        src: maskableIcon,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  // With ?v= the address changes whenever the contents do, so it can be kept for a day (by the phone and by the CDN)
  const versioned = new URL(request.url).searchParams.has("v");
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": clientLink ? "private, no-store" : versioned ? "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=300, s-maxage=300",
    },
  });
}
