import { maskAuditRows } from "@/lib/audit-privacy";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logSecurityEvent, getRequestMeta } from "@/lib/audit";
import { writeSecurityEvent } from "@/lib/security-log";
import { loadPermissions } from "@/lib/access-server";
import { AUDIT_LOG_COLS, SECURITY_EVENT_COLS } from "@/lib/columns";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!(await loadPermissions(supabase, (data?.role as string) || "user")).has("security.view")) {
    await writeSecurityEvent(await getRequestMeta(), {
      eventType: "access_denied",
      severity: "warning",
      emailAttempted: user.email,
      userId: user.id,
      details: { api: "security log", role: data?.role || "unknown" },
    });
    return null;
  }
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
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const eventType = url.searchParams.get("eventType");
    const severity = url.searchParams.get("severity");
    const action = url.searchParams.get("action");
    const entityType = url.searchParams.get("entityType");
    const email = url.searchParams.get("email");
    const ip = url.searchParams.get("ip");

    // The page sends exact instants (start and end of the admin's own local day), so the range
    // does not depend on the server's time zone. A plain date is still accepted (read as UTC).
    const instant = (v: string, end: boolean) => {
      const d = new Date(v.includes("T") ? v : v + (end ? "T23:59:59.999Z" : "T00:00:00Z"));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };
    const since = (from && instant(from, false)) || new Date(Date.now() - 7 * 86400000).toISOString();
    const until = to ? instant(to, true) : null;
    const supabase = adminClient();

    let eventsQuery = supabase.from("security_events").select(SECURITY_EVENT_COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    let auditsQuery = supabase.from("audit_logs").select(AUDIT_LOG_COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (until) {
      eventsQuery = eventsQuery.lte("created_at", until);
      auditsQuery = auditsQuery.lte("created_at", until);
    }
    if (eventType) eventsQuery = eventsQuery.eq("event_type", eventType);
    if (severity) eventsQuery = eventsQuery.eq("severity", severity);
    if (email) eventsQuery = eventsQuery.ilike("email_attempted", `%${email}%`);
    if (ip) eventsQuery = eventsQuery.ilike("ip_address", `%${ip}%`);
    if (action) auditsQuery = auditsQuery.ilike("action", `%${action}%`);
    if (entityType) auditsQuery = auditsQuery.eq("entity_type", entityType);
    if (email) auditsQuery = auditsQuery.ilike("actor_email", `%${email}%`);

    const [events, audits] = await Promise.all([eventsQuery, auditsQuery]);

    return NextResponse.json({
      events: events.data || [],
      // amounts never leave the server in full: the trail shows what happened, not how much (see lib/audit-privacy.ts)
      audits: maskAuditRows(audits.data || []),
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
