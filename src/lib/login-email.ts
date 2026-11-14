import { TEMP_PASSWORD_TTL_HOURS } from "@/lib/temp-password-config";

export const APP_LINK = "https://lifolio-woad.vercel.app/";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email that carries a new person's temporary login. Plain text and HTML versions. */
export function loginEmail(p: { email: string; firstName?: string | null; password: string; expiresAt: string; reset?: boolean }) {
  const hello = p.firstName ? `Hi ${p.firstName},` : "Hi,";
  const when = new Date(p.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  const intro = p.reset ? "A new temporary password was made for your account." : "An account was made for you.";
  const subject = p.reset ? "Your new Lifolio password" : "Your Lifolio login";
  const text = `${hello}\n\n${intro}\n\nLink: ${APP_LINK}\nUser: ${p.email}\nTemp password: ${p.password}\n\nSign in and set a new password. This temporary password works once and expires on ${when} (${TEMP_PASSWORD_TTL_HOURS} hours).\n\nIf you did not expect this, ignore this email.\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1e293b;line-height:1.5;max-width:480px"><p>${esc(hello)}</p><p>${intro}</p><table style="background:#f1f5f9;border-radius:10px;padding:10px 14px;font-family:monospace;font-size:14px"><tr><td style="color:#64748b;padding-right:10px">Link</td><td>${esc(APP_LINK)}</td></tr><tr><td style="color:#64748b;padding-right:10px">User</td><td>${esc(p.email)}</td></tr><tr><td style="color:#64748b;padding-right:10px">Temp password</td><td>${esc(p.password)}</td></tr></table><p>Sign in and set a new password. This temporary password works once and expires on ${esc(when)} (${TEMP_PASSWORD_TTL_HOURS} hours).</p><p><a href="${APP_LINK}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:bold;border-radius:10px;padding:11px 18px">Open Lifolio</a></p><p style="font-size:12px;color:#94a3b8">If you did not expect this, ignore this email.</p></div>`;
  return { subject, html, text };
}
