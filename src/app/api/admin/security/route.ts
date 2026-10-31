import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (data?.role !== "admin") return null;
  return user;
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server");
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const supabase = adminClient();

    const [events, audits] = await Promise.all([
      supabase.from("security_events").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
      supabase.from("audit_logs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
    ]);

    return NextResponse.json({
      events: events.data || [],
      audits: audits.data || [],
      eventsError: events.error?.message || null,
      auditsError: audits.error?.message || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not load security data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await logSecurityEvent({
      eventType: "login_success",
      severity: "info",
      emailAttempted: user.email,
      userId: user.id,
      details: { source: "manual test from security page" },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Test write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
