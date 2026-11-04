/** Cloudflare Turnstile (optional CAPTCHA). Enabled only when both keys are set. */
export const turnstileConfigured = () => !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export async function verifyTurnstile(token: unknown, ip: string | null, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") form.set("remoteip", ip);
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    return (await res.json())?.success === true;
  } catch {
    return false;
  }
}
