import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The id of the running deployment. The UpdateNotice in the browser compares it with the id it was built with. */
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
