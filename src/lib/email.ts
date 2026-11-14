/**
 * Sending email through Resend. Needs RESEND_API_KEY and EMAIL_FROM (for example "Lifolio <login@yourdomain.com>").
 * Without them nothing is sent and the admin pages keep working with "show it here".
 * RESEND_API_URL is only there so tests can point at a fake server.
 */
const API_URL = () => process.env.RESEND_API_URL || "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, error: "Email sending is not set up." };
  try {
    const res = await fetch(API_URL(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    let detail = "";
    try { detail = ((await res.json()) as { message?: string }).message ?? ""; } catch { /* no body */ }
    return { ok: false, error: detail || `The email service answered ${res.status}.` };
  } catch {
    return { ok: false, error: "The email service could not be reached." };
  }
}
