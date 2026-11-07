import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in person, as far as pages need to know: who they are, nothing else. */
export type SessionUser = { id: string; email: string | null };

/**
 * Who is signed in, checked properly but cheaply: the signature on the sign-in token is verified on this
 * server (getClaims), so most requests need no round trip to Supabase. If that cannot be used (older
 * signing setup, or no token) it falls back to asking Supabase (getUser), which is the slower, always-correct way.
 * A person who is removed or blocked stops being recognised when their token expires (at most an hour).
 */
export async function verifiedUser(supabase: Pick<SupabaseClient, "auth">): Promise<SessionUser | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!error && typeof sub === "string" && sub) {
      const email = data?.claims && "email" in data.claims ? (data.claims.email as unknown) : null;
      return { id: sub, email: typeof email === "string" ? email : null };
    }
  } catch {
    // fall through to the server check
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}
