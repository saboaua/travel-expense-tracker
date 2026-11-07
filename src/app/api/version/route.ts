import { NextResponse } from "next/server";
import { getLogoUrl, iconVersion } from "@/lib/brand-icon";

export const dynamic = "force-dynamic";

/**
 * The id of the running deployment (the UpdateNotice compares it with the id it was built with)
 * and the version of the app icon (the IconUpdateNotice compares it with the one this phone last saw).
 */
export async function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown", icon: iconVersion(await getLogoUrl()) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
