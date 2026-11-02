import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";
import { scanFields } from "@/lib/suspicious-input";
import { isTempPasswordExpired } from "@/lib/temp-password-config";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 10; // failed logins per IP per 15 min
const EMAIL_LIMIT = 15; // failed logins per email per 15 min (across all IPs)

/**
 * Server-side sign-in. Doing it here (instead of in the browser) means every attempt is
 * logged, and a locked-out client is refused *before* the password is checked.
 */
export async function POST(request: Request) {
  const meta = metaFromRequest(request);
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 1024) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = key
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  // Flag attack-looking strings in the email field (signal only, nothing is blocked)
  const hits = scanFields({ email });
  if (hits.length) {
    await writeSecurityEvent(meta, {
      eventType: "suspicious_input",
      severity: "warning",
      emailAttempted: email.slice(0, 120),
      details: { endpoint: "login", hits },
    });
  }

  // Lockout check BEFORE trying the password
  if (db) {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const [byIp, byEmail] = await Promise.all([
      db.from("security_events").select("id", { count: "exact", head: true }).eq("event_type", "login_failed").eq("ip_address", meta.ip).gte("created_at", since),
      db.from("security_events").select("id", { count: "exact", head: true }).eq("event_type", "login_failed").eq("email_attempted", email).gte("created_at", since),
    ]);
    const ipFails = byIp.count ?? 0;
    const emailFails = byEmail.count ?? 0;
    if (ipFails >= IP_LIMIT || emailFails >= EMAIL_LIMIT) {
      // Log at most one "blocked" event per minute per IP so an attacker can't flood the table
      const { count: recent } = await db
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "login_blocked")
        .eq("ip_address", meta.ip)
        .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString());
      if (!recent) {
        await writeSecurityEvent(meta, {
          eventType: "login_blocked",
          severity: "critical",
          emailAttempted: email,
          details: { ip_failures_15min: ipFails, email_failures_15min: emailFails },
        });
      }
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again in 15 minutes.", blocked: true },
        { status: 429 }
      );
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await writeSecurityEvent(meta, {
      eventType: "login_failed",
      severity: "warning",
      emailAttempted: email,
      details: { error: error?.message || "Invalid credentials" },
    });
    return NextResponse.json({ error: error?.message || "Invalid login credentials" }, { status: 401 });
  }

  // Temporary password past its expiry: refuse and end the session
  if (db) {
    const { data: prof } = await db
      .from("profiles")
      .select("must_change_password, temp_password_expires_at")
      .eq("id", data.user.id)
      .single();
    if (isTempPasswordExpired(prof?.must_change_password, prof?.temp_password_expires_at as string | null)) {
      await supabase.auth.signOut();
      await writeSecurityEvent(meta, {
        eventType: "temp_password_expired",
        severity: "warning",
        emailAttempted: email,
        userId: data.user.id,
        details: { expired_at: prof?.temp_password_expires_at },
      });
      return NextResponse.json(
        { error: "Your temporary password has expired. Please ask an administrator to generate a new one.", expired: true },
        { status: 403 }
      );
    }
  }

  await writeSecurityEvent(meta, {
    eventType: "login_success",
    severity: "info",
    emailAttempted: email,
    userId: data.user.id,
    details: { method: "password" },
  });
  return NextResponse.json({ ok: true });
}
