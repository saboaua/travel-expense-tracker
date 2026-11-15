/** Server helpers for Bitcoin Pro payments. */
import { PAYMENT_BASE_SETTINGS_COLS, PAYMENT_SETTINGS_COLS, EMPTY_SETTINGS, type PaymentSettings } from "@/lib/payments";
import { isMissingColumn } from "@/lib/columns";
import { deriveAddress, parseExtendedKey, type XpubType } from "@/lib/bitcoin-xpub";

export { serviceDb, type ServiceDb } from "@/lib/service-db";
import type { ServiceDb } from "@/lib/service-db";

/** Payment settings, with Bitcoin switched off when the Bitcoin migration has not been run. */
export async function loadSettings(db: ServiceDb): Promise<PaymentSettings | null> {
  let res = await db.from("payment_settings").select(PAYMENT_SETTINGS_COLS).eq("id", 1).maybeSingle();
  if (isMissingColumn(res.error)) res = (await db.from("payment_settings").select(PAYMENT_BASE_SETTINGS_COLS).eq("id", 1).maybeSingle()) as typeof res;
  if (res.error) return null;
  const s = { ...EMPTY_SETTINGS, ...((res.data as unknown as Partial<PaymentSettings>) ?? {}) };
  return { ...s, monthly_price: Number(s.monthly_price), yearly_price: Number(s.yearly_price), accounts: Array.isArray(s.accounts) ? s.accounts : [], btc_enabled: s.btc_enabled === true, btc_quote_minutes: Number(s.btc_quote_minutes) || 30, btc_confirmations: Number(s.btc_confirmations) || 0 };
}

export type Wallet = { xpub: string | null; xpub_type: XpubType | null; next_index: number };

/** The wallet key, if the admin set one. Null when the key table is missing or empty. Server only: never sent to a browser. */
export async function loadWallet(db: ServiceDb): Promise<Wallet | null> {
  const { data, error } = await db.from("btc_wallet").select("xpub, xpub_type, next_index").eq("id", 1).maybeSingle();
  if (error || !data?.xpub) return null;
  return { xpub: data.xpub as string, xpub_type: (data.xpub_type as XpubType) ?? "legacy", next_index: Number(data.next_index) || 0 };
}

/** True while an address can be given: a wallet key is set, or at least one address in the list is unused. */
export async function hasFreeAddress(db: ServiceDb): Promise<boolean> {
  if (await loadWallet(db)) return true;
  const { data, error } = await db.from("btc_addresses").select("address").is("payment_id", null).limit(1);
  return !error && (data ?? []).length > 0;
}

/** How many unpaid requests in a row may hold their own address before the oldest expired one is used again. Keeps wallets that scan a short way ahead in sight of every payment. */
export const GAP = 5;

/** Give a request one address. Returns null when none can be given. */
export async function takeAddress(db: ServiceDb, paymentId: string): Promise<string | null> {
  const wallet = await loadWallet(db);
  if (wallet) return takeDerived(db, paymentId, wallet);
  for (let i = 0; i < 6; i++) {
    const { data: free } = await db.from("btc_addresses").select("address").is("payment_id", null).is("derive_index", null).order("created_at", { ascending: true }).limit(1);
    const candidate = free?.[0]?.address as string | undefined;
    if (!candidate) return null;
    const { data: took } = await db.from("btc_addresses").update({ payment_id: paymentId }).eq("address", candidate).is("payment_id", null).select("address");
    if ((took ?? []).length === 1) return candidate;
  }
  return null;
}

async function takeDerived(db: ServiceDb, paymentId: string, wallet: Wallet): Promise<string | null> {
  const key = parseExtendedKey(wallet.xpub!, wallet.xpub_type ?? undefined);
  if (!key.ok) return null;
  const type = key.type;
  // The last few derived addresses: are they all waiting on a request nobody said they paid?
  const { data: recent } = await db.from("btc_addresses").select("address, payment_id, derive_index").gte("derive_index", 0).order("derive_index", { ascending: false }).limit(GAP);
  const rows = (recent ?? []) as { address: string; payment_id: string | null; derive_index: number }[];
  const ids = rows.map((r) => r.payment_id).filter((x): x is string => !!x);
  const { data: pays } = ids.length ? await db.from("plan_payments").select("id, status, claimed_at, expires_at").in("id", ids) : { data: [] };
  const byId = new Map((pays ?? []).map((p) => [p.id as string, p as { id: string; status: string; claimed_at: string | null; expires_at: string | null }]));
  const idle = (r: { payment_id: string | null }) => { const p = r.payment_id ? byId.get(r.payment_id) : null; return !p || (p.status !== "confirmed" && !p.claimed_at); };
  const expiredFree = (r: { payment_id: string | null }) => { const p = r.payment_id ? byId.get(r.payment_id) : null; return !p || (p.status === "expired") || (p.status === "pending" && !p.claimed_at && !!p.expires_at && new Date(p.expires_at).getTime() <= Date.now()); };
  if (rows.length >= GAP && rows.every(idle)) {
    // Do not go further ahead: use the oldest of them whose price has run out
    const reuse = [...rows].reverse().find(expiredFree);
    if (!reuse) return null;
    const { data: took } = await db.from("btc_addresses").update({ payment_id: paymentId }).eq("address", reuse.address).eq("derive_index", reuse.derive_index).select("address");
    return (took ?? []).length === 1 ? reuse.address : null;
  }
  for (let i = 0; i < 6; i++) {
    const { data: w } = await db.from("btc_wallet").select("next_index").eq("id", 1).maybeSingle();
    const n = Number(w?.next_index);
    if (!Number.isInteger(n) || n < 0) return null;
    // Only one request can move the counter from n to n + 1
    const { data: moved } = await db.from("btc_wallet").update({ next_index: n + 1 }).eq("id", 1).eq("next_index", n).select("next_index");
    if ((moved ?? []).length !== 1) continue;
    const address = deriveAddress(key.key, type, n);
    const { error } = await db.from("btc_addresses").insert({ address, payment_id: paymentId, derive_index: n });
    if (!error) return address;
  }
  return null;
}
