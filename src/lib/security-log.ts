// Edge-safe security event writer (no next/headers), usable from middleware and route handlers.
import { createClient } from "@supabase/supabase-js";

export type RequestMeta = { ip: string; userAgent: string; origin: string; country: string | null };

export function metaFromRequest(request: Request): RequestMeta {
  const h = request.headers;
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown",
    userAgent: h.get("user-agent") || "unknown",
    origin: h.get("origin") || h.get("referer") || "unknown",
    country: h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null,
  };
}

export type SecurityEventInput = {
  eventType: string;
  severity?: "info" | "warning" | "critical";
  emailAttempted?: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
};

/** Writes a security event. Never throws: logging must not break the request. */
export async function writeSecurityEvent(meta: RequestMeta, e: SecurityEventInput) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return;
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await db.from("security_events").insert({
      event_type: e.eventType,
      severity: e.severity || "info",
      email_attempted: e.emailAttempted || null,
      user_id: e.userId || null,
      ip_address: meta.ip,
      user_agent: meta.userAgent,
      origin: meta.origin,
      country: meta.country,
      details: e.details || {},
    });
  } catch (err) {
    console.error("[security-log]", err);
  }
}
