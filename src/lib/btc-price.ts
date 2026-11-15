/** Where the Bitcoin price comes from: a public spot price (Coinbase), kept for a minute. BTC_PRICE_API can point at another host (tests). Server only. */
import { parseSpot } from "@/lib/bitcoin";

let cache: { at: number; usd: number } | null = null;

export async function getBtcUsd(now = Date.now()): Promise<number | null> {
  if (cache && now - cache.at < 60_000) return cache.usd;
  const base = (process.env.BTC_PRICE_API || "https://api.coinbase.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/v2/prices/BTC-USD/spot`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const usd = parseSpot(await res.json());
    if (usd == null) return null;
    cache = { at: now, usd };
    return usd;
  } catch { return null; }
}

/** Tests only. */
export const resetBtcPriceCache = () => { cache = null; };
