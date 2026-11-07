import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { rateLimit } from "@/lib/rate-limit";
import { rateToUsd } from "@/lib/currencies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Signed-in people only (every caller is inside the app), and capped, since each new currency can call an outside rate service
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await rateLimit(`fx:${user.id}`, 300, 3600))) return NextResponse.json({ error: "Too many rate lookups. Try again later." }, { status: 429 });
  const from = (new URL(request.url).searchParams.get("from") || "USD").toUpperCase();
  // Only accept a plain 3-letter currency code
  if (!/^[A-Z]{3}$/.test(from)) return NextResponse.json({ error: "Invalid currency code" }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("currencies")
      .select("usd_rate")
      .eq("code", from)
      .maybeSingle();

    const rate = await rateToUsd(from, data?.usd_rate);
    return NextResponse.json({ from, to: "USD", rate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rate lookup failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
