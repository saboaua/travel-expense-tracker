import { createClient as createServiceClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySecurityEvent, alertAdminsOfAudit } from "@/lib/telegram-alerts";

function getServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server");
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getRequestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown";
  const userAgent = h.get("user-agent") || "unknown";
  const origin = h.get("origin") || h.get("referer") || "unknown";
  const country = h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null;
  return { ip, userAgent, origin, country };
}

export type AuditParams = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

/** Writes one audit row with the given client. Used by logAudit and by the Telegram bot (no request headers there). */
export async function writeAuditRow(supabase: SupabaseClient, meta: { ip: string; userAgent: string; origin: string }, params: AuditParams) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: params.actorId || null,
    actor_email: params.actorEmail || null,
    action: params.action,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    details: params.details || {},
    ip_address: meta.ip,
    user_agent: meta.userAgent,
    origin: meta.origin,
  });
  if (error) throw new Error(error.message);
}

export async function logAudit(params: AuditParams) {
  const meta = await getRequestMeta();
  const supabase = getServiceClient();
  await writeAuditRow(supabase, meta, params);
  await alertAdminsOfAudit(supabase, params);
}

export async function logSecurityEvent(params: {
  eventType: string;
  severity?: "info" | "warning" | "critical";
  emailAttempted?: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  const meta = await getRequestMeta();
  const supabase = getServiceClient();
  const { error } = await supabase.from("security_events").insert({
    event_type: params.eventType,
    severity: params.severity || "info",
    email_attempted: params.emailAttempted || null,
    user_id: params.userId || null,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
    origin: meta.origin,
    country: meta.country,
    details: params.details || {},
  });
  if (error) throw new Error(error.message);
  await notifySecurityEvent(supabase, { eventType: params.eventType, severity: params.severity, emailAttempted: params.emailAttempted, details: params.details });
}
