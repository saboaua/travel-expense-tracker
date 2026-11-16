/** Bitcoin quotes for Pro: the amount is locked for a short time so the price cannot move under the customer. Pure helpers, safe on the server and the client. */

export const SATS = 100_000_000;

/** BTC to send. Rounded up to the satoshi so the shop never receives a hair less than the price. Null when an input is not usable. */
export function btcAmount(price: number, usdPerUnit: number, btcUsd: number): number | null {
  if (![price, usdPerUnit, btcUsd].every((n) => Number.isFinite(n) && n > 0)) return null;
  const usd = price * usdPerUnit;
  const sats = Math.ceil(Math.round((usd / btcUsd) * SATS * 1000) / 1000);
  return sats / SATS;
}

/** "0.00123456", always 8 decimals. */
export const formatBtc = (n: number) => n.toFixed(8);

export const quoteExpired = (expiresAt: string | null | undefined, now = Date.now()) => !expiresAt || new Date(expiresAt).getTime() <= now;

/** Whole seconds left, never below 0. */
export const secondsLeft = (expiresAt: string | null | undefined, now = Date.now()) => (expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0);

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** The link a wallet opens from the QR code (BIP 21). */
export function bip21(address: string, amount: number, label = "Lifolio Pro"): string {
  return `bitcoin:${address}?amount=${formatBtc(amount)}&label=${encodeURIComponent(label)}`;
}

export const explorerAddress = (address: string) => `https://mempool.space/address/${encodeURIComponent(address)}`;
export const explorerTx = (txid: string) => `https://mempool.space/tx/${encodeURIComponent(txid)}`;

/** Pull a transaction id out of what people paste (a bare id, or an explorer link). Null if there is none. */
export function parseTxid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/[0-9a-fA-F]{64}/);
  return m ? m[0].toLowerCase() : null;
}

/** Look at the Coinbase-style response. Returns USD per BTC or null. */
export function parseSpot(json: unknown): number | null {
  const n = Number((json as { data?: { amount?: unknown } })?.data?.amount);
  return Number.isFinite(n) && n > 1000 && n < 10_000_000 ? n : null;
}
