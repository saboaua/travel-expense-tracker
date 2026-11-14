import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cleanRequest } from "@/lib/account-requests";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public: someone on the sign-in screen asks for an account. Stored for the admins; nothing is created and nothing can be read back. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Could not read your request." }, { status: 400 });
  // Hidden field that people never fill in: a filled one is a bot. Pretend it worked.
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const checked = cleanRequest({ name: String(body.name ?? ""), email: String(body.email ?? ""), phone: String(body.phone ?? "") });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!(await rateLimit(`acctreq:${ip}`, 5, 3600))) return NextResponse.json({ error: "Too many requests from this device. Please try again later." }, { status: 429 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Account requests are not set up yet. Please contact your administrator." }, { status: 500 });
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.from("account_requests").insert({ ...checked.value, status: "new", ip });
  if (error) {
    const missing = /relation|schema cache|does not exist/i.test(error.message);
    return NextResponse.json({ error: missing ? "Account requests are not set up yet. Please contact your administrator." : "Could not send your request. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
