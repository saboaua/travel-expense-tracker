import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/audit";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Only a signed-in user can write a logout event (stops anonymous log flooding)
    if (!user) return NextResponse.json({ ok: true });

    await logSecurityEvent({
      eventType: "logout",
      severity: "info",
      emailAttempted: user?.email || null,
      userId: user?.id || null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
