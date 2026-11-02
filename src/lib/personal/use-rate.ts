"use client";

import { useEffect, useState } from "react";

/** Loads the market rate to USD for a currency (same /api/fx endpoint as business expenses). */
export function useUsdRate(currency: string, enabled = true) {
  const [rate, setRate] = useState(currency === "USD" ? "1" : "");
  const [source, setSource] = useState<"usd" | "market" | "manual">(currency === "USD" ? "usd" : "manual");

  useEffect(() => {
    let cancelled = false;
    if (!enabled && currency !== "USD") return;
    if (currency === "USD") {
      setRate("1");
      setSource("usd");
      return;
    }
    fetch(`/api/fx?from=${currency}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (ok && typeof d.rate === "number") {
          setRate(String(d.rate));
          setSource("market");
        } else setSource("manual");
      })
      .catch(() => !cancelled && setSource("manual"));
    return () => {
      cancelled = true;
    };
  }, [currency, enabled]);

  return { rate, setRate, source };
}
