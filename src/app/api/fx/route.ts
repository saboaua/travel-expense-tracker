import { NextResponse } from "next/server";
import { rateToUsd } from "@/lib/currencies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const from = new URL(request.url).searchParams.get("from") || "USD";
  try {
    const rate = await rateToUsd(from);
    return NextResponse.json({ from: from.toUpperCase(), to: "USD", rate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rate lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
