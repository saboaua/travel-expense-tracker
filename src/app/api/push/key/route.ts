import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";
import { noStore } from "@/lib/sharing-server";

export const dynamic = "force-dynamic";

/** The public half of the push key (safe to show), or "not set up" so the page can say so. */
export async function GET() {
  if (!pushConfigured()) return NextResponse.json({ configured: false }, { headers: noStore });
  return NextResponse.json({ configured: true, key: process.env.VAPID_PUBLIC_KEY }, { headers: noStore });
}
