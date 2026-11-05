import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { metaFromRequest, writeSecurityEvent } from "@/lib/security-log";
import { notifySupportRequest } from "@/lib/telegram-alerts";
import { scanFields } from "@/lib/suspicious-input";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: real people never fill this hidden field. Pretend success so bots move on.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    await writeSecurityEvent(metaFromRequest(request), {
      eventType: "support_spam",
      severity: "warning",
      emailAttempted: typeof body.email === "string" ? body.email.slice(0, 120) : null,
      details: { reason: "honeypot filled" },
    });
    return NextResponse.json({ success: true });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!name || name.length > 100) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (subject.length > 150) return NextResponse.json({ error: "Subject is too long." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: "Please describe your question (at least 10 characters)." }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: "Message is too long (4000 characters max)." }, { status: 400 });

  const meta = metaFromRequest(request);
  const hits = scanFields({ name, email, subject, message });
  if (hits.length) {
    await writeSecurityEvent(meta, {
      eventType: "suspicious_input",
      severity: "warning",
      emailAttempted: email.slice(0, 120),
      details: { endpoint: "support", hits },
    });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Support form is not configured yet." }, { status: 500 });

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";

  // Simple rate limit: 5 messages per IP per hour
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await db
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) {
    await writeSecurityEvent(meta, {
      eventType: "rate_limit",
      severity: "warning",
      emailAttempted: email.slice(0, 120),
      details: { endpoint: "support", messages_last_hour: count },
    });
    return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 });
  }

  const { data: created, error } = await db.from("support_requests").insert({
    name,
    email,
    subject: subject || null,
    message,
    ip,
  }).select("id").single();
  if (error) {
    console.error("support insert failed:", error);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }

  // Tell the admins on Telegram (never blocks or fails the request)
  if (created?.id) await notifySupportRequest(db, name, subject || null, String(created.id));

  // Optional email notification (needs RESEND_API_KEY and a support email in Branding)
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const { data: settings } = await db.from("app_settings").select("app_name, support_email").eq("id", 1).single();
      if (settings?.support_email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.SUPPORT_FROM_EMAIL || "onboarding@resend.dev",
            to: [settings.support_email],
            reply_to: email,
            subject: `[${settings.app_name || "Support"}] ${subject || "New support request"}`,
            html: `<p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt;</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
          }),
          signal: AbortSignal.timeout(5000),
        });
      }
    }
  } catch (e) {
    console.error("support email notification failed:", e);
  }

  return NextResponse.json({ success: true });
}
