"use client";

import { useEffect, useState } from "react";
import { fixedRate } from "@/lib/currencies";

/** Loads the market rate to USD for a currency (same /api/fx endpoint as business expenses). */
export function useUsdRate(currency: string, enabled = true) {
  // Start from the built-in rate (AWG is pegged), so saving never waits for the network
  const [rate, setRate] = useState(currency === "USD" ? "1" : fixedRate(currency) ? String(fixedRate(currency)) : "");
  const [source, setSource] = useState<"usd" | "market" | "manual">(currency === "USD" ? "usd" : fixedRate(currency) ? "market" : "manual");

  useEffect(() => {
    let cancelled = false;
    if (!enabled && currency !== "USD") return;
    if (currency === "USD") {
      setRate("1");
      setSource("usd");
      return;
    }
    const fixed = fixedRate(currency);
    if (fixed) { setRate(String(fixed)); setSource("market"); }
    fetch(`/api/fx?from=${currency}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (ok && typeof d.rate === "number") {
          setRate(String(d.rate));
          setSource("market");
        } else if (!fixed) setSource("manual");
      })
      .catch(() => { if (!cancelled && !fixed) setSource("manual"); });
    return () => {
      cancelled = true;
    };
  }, [currency, enabled]);

  return { rate, setRate, source };
}
