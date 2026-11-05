// Edge-safe security event writer (no next/headers), usable from middleware and route handlers.
import { createClient } from "@supabase/supabase-js";
import { notifySecurityEvent } from "./telegram-alerts";
import { clampDetails, createLogLimiter } from "./log-limit";

type RequestMeta = { ip: string; userAgent: string; origin: string; country: string | null };

export function metaFromRequest(request: Request): RequestMeta {
  const h = request.headers;
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown",
    userAgent: h.get("user-agent") || "unknown",
    origin: h.get("origin") || h.get("referer") || "unknown",
    country: h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null,
  };
}

type SecurityEventInput = {
  eventType: string;
  severity?: "info" | "warning" | "critical";
  emailAttempted?: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
};

// Events an outsider can trigger at will. Capped per address so they cannot fill the table.
const FLOODABLE = new Set(["suspicious_input", "rate_limit", "support_spam", "csp_violation", "access_denied", "login_failed", "login_blocked", "protection_degraded"]);
const allowLog = createLogLimiter();
const cut = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : v ?? null);

/** Writes a security event. Never throws: logging must not break the request. */
export async function writeSecurityEvent(meta: RequestMeta, e: SecurityEventInput) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return;
    let extra: Record<string, unknown> = {};
    if (FLOODABLE.has(e.eventType)) {
      const { write, suppressed } = allowLog(meta.ip, e.eventType);
      if (!write) return;
      if (suppressed) extra = { suppressed_since_last: suppressed };
    }
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await db.from("security_events").insert({
      event_type: e.eventType,
      severity: e.severity || "info",
      email_attempted: cut(e.emailAttempted, 254) || null,
      user_id: e.userId || null,
      ip_address: cut(meta.ip, 64),
      user_agent: cut(meta.userAgent, 300),
      origin: cut(meta.origin, 300),
      country: meta.country,
      details: { ...clampDetails(e.details), ...extra },
    });
    // A failed insert does not throw; without this the log would silently stay empty
    if (error) console.error("[security-log] insert failed:", error.message);
    else await notifySecurityEvent(db, { eventType: e.eventType, severity: e.severity, emailAttempted: e.emailAttempted, details: e.details });
  } catch (err) {
    console.error("[security-log]", err);
  }
}
