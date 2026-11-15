/** Server helpers for Bitcoin Pro payments. */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { PAYMENT_BASE_SETTINGS_COLS, PAYMENT_SETTINGS_COLS, EMPTY_SETTINGS, type PaymentSettings } from "@/lib/payments";
import { isMissingColumn } from "@/lib/columns";

export function serviceDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
export type ServiceDb = NonNullable<ReturnType<typeof serviceDb>>;

/** Payment settings, with Bitcoin switched off when the Bitcoin migration has not been run. */
export async function loadSettings(db: ServiceDb): Promise<PaymentSettings | null> {
  let res = await db.from("payment_settings").select(PAYMENT_SETTINGS_COLS).eq("id", 1).maybeSingle();
  if (isMissingColumn(res.error)) res = (await db.from("payment_settings").select(PAYMENT_BASE_SETTINGS_COLS).eq("id", 1).maybeSingle()) as typeof res;
  if (res.error) return null;
  const s = { ...EMPTY_SETTINGS, ...((res.data as unknown as Partial<PaymentSettings>) ?? {}) };
  return { ...s, monthly_price: Number(s.monthly_price), yearly_price: Number(s.yearly_price), accounts: Array.isArray(s.accounts) ? s.accounts : [], btc_enabled: s.btc_enabled === true, btc_quote_minutes: Number(s.btc_quote_minutes) || 30, btc_confirmations: Number(s.btc_confirmations) || 0 };
}

/** True while at least one address in the pool is unused. */
export async function hasFreeAddress(db: ServiceDb): Promise<boolean> {
  const { data, error } = await db.from("btc_addresses").select("address").is("payment_id", null).limit(1);
  return !error && (data ?? []).length > 0;
}
