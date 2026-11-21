import { getBrand } from "@/lib/brand-icon";
import nodemailer from "nodemailer";

/**
 * Sending email. Gmail is used when GMAIL_USER and GMAIL_APP_PASSWORD are set (a Google "App password", 2-step
 * verification on); otherwise Resend. Needs RESEND_API_KEY and EMAIL_FROM (for example "Your App <login@yourdomain.com>").
 * Without them nothing is sent and the admin pages keep working with "show it here".
 * RESEND_API_URL is only there so tests can point at a fake server.
 */
const API_URL = () => process.env.RESEND_API_URL || "https://api.resend.com/emails";

const gmailOn = () => !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD;
const resendOn = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export function emailConfigured(): boolean {
  return gmailOn() || resendOn();
}

/** Which service will send: "gmail", "resend" or null. */
export function emailProvider(): "gmail" | "resend" | null {
  return gmailOn() ? "gmail" : resendOn() ? "resend" : null;
}

async function sendGmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  try {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_PORT || "465") === "465",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await t.sendMail({ from: `${(await getBrand().then((b) => b.appName, () => null)) || "App"} <${process.env.GMAIL_USER}>`, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return { ok: true };
  } catch (e) {
    const code = (e as { responseCode?: number }).responseCode;
    return { ok: false, error: code === 535 ? "Gmail refused the sign-in. Check the app password." : "Gmail could not send the message." };
  }
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, error: "Email sending is not set up." };
  if (gmailOn()) return sendGmail(msg);
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
