/** The Supabase client that bypasses row rules. Server only. Null when the service key is not set. */
import { createClient as createServiceClient } from "@supabase/supabase-js";

export function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
export type ServiceDb = NonNullable<ReturnType<typeof serviceDb>>;
