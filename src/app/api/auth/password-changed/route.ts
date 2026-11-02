import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";

/** Called by the browser after a successful password change so it shows up in the security log. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let source = "profile";
  try {
    const body = await request.json();
    if (body?.source === "first_login") source = "first_login";
  } catch {
    // no body
  }

  await writeSecurityEvent(metaFromRequest(request), {
    eventType: "password_changed",
    severity: "info",
    emailAttempted: user.email,
    userId: user.id,
    details: { source },
  });
  return NextResponse.json({ ok: true });
}
