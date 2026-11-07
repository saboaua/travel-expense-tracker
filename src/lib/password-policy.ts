/** One password rule for every screen that sets a password, and plain-language errors for the auth calls around it. */

export const PASSWORD_MIN = 8;
export const PASSWORD_RULE = "At least 8 characters, with an uppercase letter, a lowercase letter and a number.";

/** What is wrong with a new password, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return "At least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Include an uppercase letter";
  if (!/[a-z]/.test(pw)) return "Include a lowercase letter";
  if (!/[0-9]/.test(pw)) return "Include a number";
  return null;
}

/** The message to show when a new password and its confirmation are submitted, or null when they can be saved. */
export function passwordFormProblem(pw: string, confirm: string): string | null {
  return passwordProblem(pw) ?? (pw !== confirm ? "Passwords do not match" : null);
}

/** Safari says "Load failed", Chrome "Failed to fetch", Firefox "NetworkError": all mean the request never got an answer. */
export function isNetworkError(e: unknown): boolean {
  const text = `${(e as { name?: string } | null)?.name ?? ""} ${(e as { message?: string } | null)?.message ?? ""}`;
  return /load failed|failed to fetch|networkerror|network request failed|fetch failed|retryablefetch|timeout|timed out/i.test(text);
}

export const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

/** A message a person can act on: network errors get a plain sentence, anything else keeps its own words. */
export function friendlyAuthError(e: unknown, fallback: string): string {
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  const m = (e as { message?: string } | null)?.message;
  return m && m.trim() ? m : fallback;
}

/** Runs a call again once or twice when only the connection failed. Setting the same password twice is harmless. */
export async function retryOnNetwork<T>(run: () => Promise<T>, tries = 3, waitMs = 700): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const result = await run();
      const err = (result as { error?: unknown } | null)?.error;
      if (err && isNetworkError(err) && i < tries - 1) {
        last = err;
      } else {
        return result;
      }
    } catch (e) {
      if (!isNetworkError(e) || i === tries - 1) throw e;
      last = e;
    }
    await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
  }
  throw last;
}
