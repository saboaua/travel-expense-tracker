import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";
import { scanFields } from "@/lib/suspicious-input";
import { isTempPasswordExpired } from "@/lib/temp-password-config";
import { MemoryStore, ResilientStore, SupabaseStore, decide, keysFor, recordFailure, recordSuccess } from "@/lib/auth-throttle";
import { turnstileConfigured, verifyTurnstile } from "@/lib/turnstile";

// Used when the database counters cannot be reached (per server instance)
const memory = new MemoryStore();
let lastDegradedLog = 0;

export const dynamic = "force-dynamic";

/**
 * Server-side sign-in. Doing it here (instead of in the browser) means every attempt is
 * logged, and a locked-out client is refused *before* the password is checked.
 */
export async function POST(request: Request) {
  const meta = metaFromRequest(request);
  let body: { email?: unknown; password?: unknown; captchaToken?: unknown };
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

  // Counters live in their own table; if it cannot be reached we keep limiting from memory and tell the admin
  const store = new ResilientStore(
    db ? new SupabaseStore((fn, args) => db.rpc(fn, args)) : null,
    memory,
    (reason) => {
      if (Date.now() - lastDegradedLog < 10 * 60 * 1000) return;
      lastDegradedLog = Date.now();
      console.error("[auth-throttle] degraded:", reason);
      void writeSecurityEvent(meta, {
        eventType: "protection_degraded",
        severity: "warning",
        details: { component: "login lockout", reason: reason.slice(0, 200), hint: "Run supabase/migration_throttle_retention.sql" },
      });
    }
  );
  const keys = keysFor(meta.ip, email);
  const captchaOn = turnstileConfigured();

  // Lockout check BEFORE trying the password
  const status = await store.status([keys.ip, keys.pair, keys.email].filter(Boolean) as string[]);
  let captchaPassed = false;
  if (captchaOn && body.captchaToken) captchaPassed = await verifyTurnstile(body.captchaToken, meta.ip);
  const decision = decide(status, keys, { captchaConfigured: captchaOn, captchaPassed });

  if (decision.action === "block") {
    await writeSecurityEvent(meta, {
      eventType: "login_blocked",
      severity: "critical",
      emailAttempted: email,
      details: { scope: decision.scope, retry_after_sec: decision.retryAfterSec },
    });
    const minutes = Math.max(1, Math.ceil(decision.retryAfterSec / 60));
    return NextResponse.json(
      { error: `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, blocked: true },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } }
    );
  }
  if (decision.action === "captcha") {
    // Not counted as a password attempt
    return NextResponse.json(
      { error: "Please complete the security check to continue.", captcha_required: true },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const { captchaNext } = await recordFailure(store, keys, captchaOn);
    await writeSecurityEvent(meta, {
      eventType: "login_failed",
      severity: "warning",
      emailAttempted: email,
      details: { error: error?.message || "Invalid credentials" },
    });
    // Same wording for every failure so the response never reveals which part was wrong
    return NextResponse.json({ error: "Invalid email or password.", ...(captchaNext ? { captcha_required: true } : {}) }, { status: 401 });
  }

  await recordSuccess(store, keys);

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
